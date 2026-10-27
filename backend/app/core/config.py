from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Invoice Reconciliation MVP"
    secret_key: str = "development-only-change-this-secret"
    access_token_minutes: int = 480
    database_url: str = "sqlite:///./data/invoices.db"
    upload_dir: str = "./data/uploads"
    admin_email: str = "admin@gmail.com"
    admin_password: str = "admin"
    accountant_email: str = "ketoan@gmail.com"
    accountant_password: str = "admin"
    chief_accountant_email: str = "ketoantruong@gmail.com"
    chief_accountant_password: str = "admin"
    ocr_device: str = "cpu"
    ocr_min_confidence: float = 0.80
    currency_tolerance: float = 1.0
    item_similarity_threshold: int = 90
    inbox_scan_dir: str = ""
    load_demo_seed: bool = False
    demo_invoice_fixture_path: str = "../data/demo/public/HD_001.pdf"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
