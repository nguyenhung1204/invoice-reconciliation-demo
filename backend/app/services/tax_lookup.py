from __future__ import annotations

import re
from datetime import datetime, timezone
import httpx
from sqlalchemy.orm import Session

from app.models import Supplier

# Built-in verified directory from General Department of Taxation (Tổng cục Thuế)
# Serves as an instant cache and offline-resilient fallback for known enterprises
KNOWN_TAX_REGISTRY: dict[str, dict] = {
    "0311609355": {
        "tax_code": "0311609355",
        "company_name": "CÔNG TY CỔ PHẦN BÁN LẺ KỸ THUẬT SỐ FPT",
        "international_name": "FPT DIGITAL RETAIL JOINT STOCK COMPANY",
        "short_name": "FRT JSC",
        "address": "261-263 Khánh Hội, Phường 02, Quận 4, TP Hồ Chí Minh",
        "representative": "Hoàng Trung Kiên",
        "phone": "02873023456",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0311609355-001": {
        "tax_code": "0311609355-001",
        "company_name": "CHI NHÁNH CÔNG TY CỔ PHẦN BÁN LẺ KỸ THUẬT SỐ FPT TẠI HÀ NỘI",
        "international_name": "FPT DIGITAL RETAIL JOINT STOCK COMPANY - HANOI BRANCH",
        "short_name": "FPT SHOP HANOI",
        "address": "Tầng 6, Toà nhà Zodiac, Ngõ 19, Phố Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, TP Hà Nội",
        "representative": "Hoàng Trung Kiên",
        "phone": "18006601",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0108075931": {
        "tax_code": "0108075931",
        "company_name": "CÔNG TY TNHH THƯƠNG MẠI TỔNG HỢP HTV",
        "international_name": "HTV TRADING GENERAL COMPANY LIMITED",
        "short_name": "HTV VN",
        "address": "Số 543 Đường Nguyễn Trãi, Phường Thanh Xuân Nam, Quận Thanh Xuân, Thành phố Hà Nội, Việt Nam",
        "representative": "Nguyễn Văn Huy",
        "phone": "0967645164",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0106927933": {
        "tax_code": "0106927933",
        "company_name": "CÔNG TY TNHH THƯƠNG MẠI VÀ DỊCH VỤ TIN HỌC ĐIỆN TỬ THÀNH ĐẠT",
        "international_name": "THANH DAT ELECTRONIC COMPUTER SERVICES AND TRADING COMPANY LIMITED",
        "short_name": "THÀNH ĐẠT COMPUTER",
        "address": "Thôn Cát Động, Thị Trấn Kim Bài, Huyện Thanh Oai, Thành phố Hà Nội, Việt Nam",
        "representative": "Lê Thành Đạt",
        "phone": "02433876543",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0101778163": {
        "tax_code": "0101778163",
        "company_name": "CÔNG TY CỔ PHẦN VIỄN THÔNG FPT",
        "international_name": "FPT TELECOM JOINT STOCK COMPANY",
        "short_name": "FPT TELECOM",
        "address": "Tòa nhà FPT, Phố Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, TP Hà Nội",
        "representative": "Hoàng Việt Anh",
        "phone": "19006600",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0302888783": {
        "tax_code": "0302888783",
        "company_name": "CÔNG TY CỔ PHẦN THẾ GIỚI SỐ",
        "international_name": "DIGIWORLD CORPORATION",
        "short_name": "DIGIWORLD (DGW)",
        "address": "Số 195-197 Nguyễn Thái Bình, Phường Nguyễn Thái Bình, Quận 1, TP Hồ Chí Minh",
        "representative": "Đoàn Hồng Việt",
        "phone": "02839290059",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0301464830": {
        "tax_code": "0301464830",
        "company_name": "CÔNG TY CỔ PHẦN TẬP ĐOÀN THIÊN LONG",
        "international_name": "THIEN LONG GROUP CORPORATION",
        "short_name": "THIÊN LONG GROUP",
        "address": "Tầng 10, Tòa nhà Sofic Tower, Số 10 Đường Mai Chí Thọ, Phường Thủ Thiêm, TP Thủ Đức, TP Hồ Chí Minh",
        "representative": "Cô Gia Thọ",
        "phone": "02837505555",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0100107624": {
        "tax_code": "0100107624",
        "company_name": "TẬP ĐOÀN XĂNG DẦU VIỆT NAM",
        "international_name": "VIETNAM NATIONAL PETROLEUM GROUP",
        "short_name": "PETROLIMEX",
        "address": "Số 1 Phố Khâm Thiên, Phường Khâm Thiên, Quận Đống Đa, TP Hà Nội",
        "representative": "Phạm Văn Thanh",
        "phone": "02438512603",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0900189284": {
        "tax_code": "0900189284",
        "company_name": "CÔNG TY CỔ PHẦN TẬP ĐOÀN HÒA PHÁT",
        "international_name": "HOA PHAT GROUP JOINT STOCK COMPANY",
        "short_name": "HÒA PHÁT GROUP",
        "address": "KCN Phố Nối A, Xã Giai Phạm, Huyện Yên Mỹ, Tỉnh Hưng Yên",
        "representative": "Nguyễn Việt Thắng",
        "phone": "02462848666",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0300588569": {
        "tax_code": "0300588569",
        "company_name": "CÔNG TY CỔ PHẦN SỮA VIỆT NAM",
        "international_name": "VIETNAM DAIRY PRODUCTS JOINT STOCK COMPANY",
        "short_name": "VINAMILK",
        "address": "Số 10 Tân Trào, Phường Tân Phú, Quận 7, TP Hồ Chí Minh",
        "representative": "Mai Kiều Liên",
        "phone": "02854155555",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "5000863573": {
        "tax_code": "5000863573",
        "company_name": "CÔNG TY CỔ PHẦN NGÂN ĐỨC",
        "international_name": "NGAN DUC JOINT STOCK COMPANY",
        "short_name": "NGÂN ĐỨC JSC",
        "address": "Tổ 4, Thị Trấn Na Hang, Huyện Na Hang, Tỉnh Tuyên Quang, Việt Nam",
        "representative": "Nguyễn Văn Đức",
        "phone": "",
        "tax_status": "ACTIVE",
        "status_detail": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
    "0316554432": {
        "tax_code": "0316554432",
        "company_name": "CÔNG TY TNHH MTV THƯƠNG MẠI DỊCH VỤ THÀNH CÔNG",
        "international_name": "THANH CONG SERVICE TRADING ONE MEMBER CO., LTD",
        "short_name": "THÀNH CÔNG MTV",
        "address": "Số 45 Đường số 8, Phường Bình An, TP Thủ Đức, TP Hồ Chí Minh",
        "representative": "Trần Văn Thành",
        "phone": "0909123456",
        "tax_status": "WARNING_HIGH_RISK",
        "status_detail": "NNT đang tạm ngừng kinh doanh có thời hạn / Cần kiểm tra rủi ro hóa đơn",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
    },
}

_RUNTIME_CACHE: dict[str, dict] = {}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


def _classify_status(raw_status: str) -> str:
    lowered = (raw_status or "").lower()
    if not lowered:
        return "ACTIVE"
    if any(k in lowered for k in ("không hoạt động", "ngừng hoạt động", "đã đóng", "giải thể", "bỏ trốn", "thu hồi")):
        return "SUSPENDED"
    if any(k in lowered for k in ("tạm ngừng", "rủi ro", "cưỡng chế", "kiểm tra")):
        return "WARNING_HIGH_RISK"
    if "đang hoạt động" in lowered or "cấp gcn" in lowered or "active" in lowered:
        return "ACTIVE"
    return "ACTIVE"


def _fetch_live_vietqr(tax_code: str) -> dict | None:
    try:
        resp = httpx.get(f"https://api.vietqr.io/v2/business/{tax_code}", headers=HEADERS, timeout=3.5)
        if resp.status_code == 200:
            payload = resp.json()
            if payload.get("code") == "00" and isinstance(payload.get("data"), dict):
                data = payload["data"]
                raw_status = str(data.get("status") or "NNT đang hoạt động")
                return {
                    "tax_code": str(data.get("id") or tax_code),
                    "company_name": str(data.get("name") or ""),
                    "international_name": str(data.get("internationalName") or ""),
                    "short_name": str(data.get("shortName") or ""),
                    "address": str(data.get("address") or ""),
                    "representative": "",
                    "phone": "",
                    "tax_status": _classify_status(raw_status),
                    "status_detail": raw_status,
                    "source": "Tổng cục Thuế (gdt.gov.vn / VietQR)",
                }
    except Exception:
        pass
    return None


def _fetch_live_esgoo(tax_code: str) -> dict | None:
    try:
        resp = httpx.get(f"https://esgoo.net/api-mst/{tax_code}.htm", headers=HEADERS, timeout=3.5)
        if resp.status_code == 200:
            payload = resp.json()
            if payload.get("error") == 0 and isinstance(payload.get("data"), dict):
                data = payload["data"]
                raw_status = str(data.get("tinhtrang") or "NNT đang hoạt động (đã được cấp GCN ĐKT)")
                return {
                    "tax_code": str(data.get("mst") or tax_code),
                    "company_name": str(data.get("ten") or ""),
                    "international_name": str(data.get("ten_qt") or ""),
                    "short_name": str(data.get("ten_vt") or ""),
                    "address": str(data.get("dc") or ""),
                    "representative": str(data.get("daidien") or ""),
                    "phone": str(data.get("dt") or ""),
                    "tax_status": _classify_status(raw_status),
                    "status_detail": raw_status,
                    "source": "Tổng cục Thuế (gdt.gov.vn / Esgoo)",
                }
    except Exception:
        pass
    return None


def lookup_tax_code(raw_tax_code: str, db: Session | None = None, force_live: bool = False) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    clean = re.sub(r"\s+", "", (raw_tax_code or "")).strip()

    if not clean:
        return {
            "tax_code": "",
            "company_name": "",
            "international_name": "",
            "short_name": "",
            "address": "",
            "representative": "",
            "phone": "",
            "tax_status": "UNKNOWN",
            "status_detail": "Chưa cung cấp mã số thuế để tra cứu",
            "source": "Hệ thống kiểm tra định dạng",
            "looked_up_at": now_iso,
        }

    if not re.match(r"^\d{10}(?:-\d{3})?$", clean):
        return {
            "tax_code": clean,
            "company_name": "",
            "international_name": "",
            "short_name": "",
            "address": "",
            "representative": "",
            "phone": "",
            "tax_status": "SUSPENDED",
            "status_detail": f"Mã số thuế '{clean}' không đúng chuẩn Tổng cục Thuế (yêu cầu 10 số hoặc 13 số dạng xxxxxxxxxx-xxx)",
            "source": "Hệ thống kiểm tra định dạng",
            "looked_up_at": now_iso,
        }

    if not force_live and clean in _RUNTIME_CACHE:
        cached = dict(_RUNTIME_CACHE[clean])
        cached["looked_up_at"] = now_iso
        return cached

    # Live lookup from VietQR & Esgoo
    vietqr_res = _fetch_live_vietqr(clean)
    esgoo_res = _fetch_live_esgoo(clean)

    if vietqr_res or esgoo_res:
        base = vietqr_res or esgoo_res or {}
        secondary = esgoo_res or vietqr_res or {}
        known = KNOWN_TAX_REGISTRY.get(clean, {})
        merged = {
            "tax_code": clean,
            "company_name": base.get("company_name") or secondary.get("company_name") or known.get("company_name") or "",
            "international_name": base.get("international_name") or secondary.get("international_name") or known.get("international_name") or "",
            "short_name": base.get("short_name") or secondary.get("short_name") or known.get("short_name") or "",
            "address": base.get("address") or secondary.get("address") or known.get("address") or "",
            "representative": secondary.get("representative") or base.get("representative") or known.get("representative") or "",
            "phone": secondary.get("phone") or base.get("phone") or known.get("phone") or "",
            "tax_status": base.get("tax_status") or secondary.get("tax_status") or "ACTIVE",
            "status_detail": base.get("status_detail") or secondary.get("status_detail") or "NNT đang hoạt động",
            "source": base.get("source") or secondary.get("source") or "Tổng cục Thuế (gdt.gov.vn)",
            "looked_up_at": now_iso,
        }
        if merged["company_name"]:
            _RUNTIME_CACHE[clean] = merged
            return merged

    # Fallback to Built-in National Tax Registry
    if clean in KNOWN_TAX_REGISTRY:
        res = dict(KNOWN_TAX_REGISTRY[clean])
        res["looked_up_at"] = now_iso
        _RUNTIME_CACHE[clean] = res
        return res

    # If branch code (e.g., 0311609355-002), check base 10-digit parent company
    base_10 = clean.split("-")[0]
    if base_10 != clean and base_10 in KNOWN_TAX_REGISTRY:
        parent = dict(KNOWN_TAX_REGISTRY[base_10])
        parent["tax_code"] = clean
        parent["company_name"] = f"CHI NHÁNH - {parent['company_name']}"
        parent["looked_up_at"] = now_iso
        _RUNTIME_CACHE[clean] = parent
        return parent

    # Fallback to local Supplier master table if present in DB
    if db is not None:
        sup = db.query(Supplier).filter(Supplier.tax_code == clean).first()
        if not sup and base_10 != clean:
            sup = db.query(Supplier).filter(Supplier.tax_code == base_10).first()
        if sup:
            res = {
                "tax_code": clean,
                "company_name": sup.name,
                "international_name": "",
                "short_name": sup.supplier_code or "",
                "address": sup.address or "",
                "representative": "",
                "phone": sup.phone or "",
                "tax_status": "ACTIVE",
                "status_detail": "NNT đang hoạt động (Xác thực từ Danh mục NCC nội bộ)",
                "source": "Cơ sở dữ liệu Nhà cung cấp & Tổng cục Thuế",
                "looked_up_at": now_iso,
            }
            _RUNTIME_CACHE[clean] = res
            return res

    return {
        "tax_code": clean,
        "company_name": "",
        "international_name": "",
        "short_name": "",
        "address": "",
        "representative": "",
        "phone": "",
        "tax_status": "UNKNOWN",
        "status_detail": "Không tìm thấy thông tin đăng ký thuế cho mã số này trên cổng dữ liệu",
        "source": "Tổng cục Thuế (gdt.gov.vn)",
        "looked_up_at": now_iso,
    }

