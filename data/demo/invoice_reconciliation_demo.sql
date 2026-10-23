-- Full schema and data snapshot from the running Invoice Reconciliation demo.
-- Database: invoice_reconciliation (MySQL 8.4.11).
-- Includes all 25 tables, indexes, foreign keys, and current demo rows for HD_001.
-- The HD_001.pdf binary is tracked separately at data/demo/public/HD_001.pdf; invoice_files metadata is included here.
-- Restore into an empty/disposable schema: this dump drops existing tables before recreating them.

-- MySQL dump 10.13  Distrib 8.4.11, for Linux (x86_64)
--
-- Host: localhost    Database: invoice_reconciliation
-- ------------------------------------------------------
-- Server version	8.4.11

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `invoice_reconciliation`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `invoice_reconciliation` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `invoice_reconciliation`;

--
-- Table structure for table `audit_events`
--

DROP TABLE IF EXISTS `audit_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `actor_email` varchar(255) NOT NULL,
  `action` varchar(80) NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` varchar(80) NOT NULL,
  `detail` text NOT NULL,
  `created_at` datetime NOT NULL,
  `actor_user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_audit_events_action` (`action`),
  KEY `ix_audit_events_created_at` (`created_at`),
  KEY `fk_audit_events_actor` (`actor_user_id`),
  CONSTRAINT `fk_audit_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_events`
--

LOCK TABLES `audit_events` WRITE;
/*!40000 ALTER TABLE `audit_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dataset_invoice_item_labels`
--

DROP TABLE IF EXISTS `dataset_invoice_item_labels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dataset_invoice_item_labels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dataset_invoice_id` int NOT NULL,
  `line_number` int NOT NULL,
  `item_description` text NOT NULL,
  `unit` varchar(80) DEFAULT NULL,
  `quantity` decimal(18,4) DEFAULT NULL,
  `unit_price` decimal(18,2) DEFAULT NULL,
  `annotation_status` varchar(32) NOT NULL,
  `source_column` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dataset_invoice_item_label` (`dataset_invoice_id`,`line_number`),
  KEY `ix_dataset_invoice_item_labels_dataset_invoice_id` (`dataset_invoice_id`),
  CONSTRAINT `dataset_invoice_item_labels_ibfk_1` FOREIGN KEY (`dataset_invoice_id`) REFERENCES `dataset_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dataset_invoice_item_labels`
--

LOCK TABLES `dataset_invoice_item_labels` WRITE;
/*!40000 ALTER TABLE `dataset_invoice_item_labels` DISABLE KEYS */;
/*!40000 ALTER TABLE `dataset_invoice_item_labels` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dataset_invoices`
--

DROP TABLE IF EXISTS `dataset_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dataset_invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dataset_id` int NOT NULL,
  `invoice_id` int NOT NULL,
  `source_record_id` varchar(100) NOT NULL,
  `source_image` varchar(255) DEFAULT NULL,
  `source_workbook` varchar(255) NOT NULL,
  `source_sheet` varchar(255) NOT NULL,
  `source_row` int NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dataset_invoice` (`dataset_id`,`invoice_id`),
  UNIQUE KEY `uq_dataset_source_record` (`dataset_id`,`source_record_id`),
  KEY `ix_dataset_invoices_dataset_id` (`dataset_id`),
  KEY `ix_dataset_invoices_invoice_id` (`invoice_id`),
  CONSTRAINT `dataset_invoices_ibfk_1` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dataset_invoices_ibfk_2` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dataset_invoices`
--

LOCK TABLES `dataset_invoices` WRITE;
/*!40000 ALTER TABLE `dataset_invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `dataset_invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `datasets`
--

DROP TABLE IF EXISTS `datasets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `datasets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dataset_code` varchar(80) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `source_file` varchar(255) DEFAULT NULL,
  `source_sheet` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_datasets_dataset_code` (`dataset_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `datasets`
--

LOCK TABLES `datasets` WRITE;
/*!40000 ALTER TABLE `datasets` DISABLE KEYS */;
/*!40000 ALTER TABLE `datasets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `goods_receipt_items`
--

DROP TABLE IF EXISTS `goods_receipt_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `goods_receipt_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `gr_id` int NOT NULL,
  `po_item_id` int DEFAULT NULL,
  `line_number` int NOT NULL,
  `product_id` int DEFAULT NULL,
  `item_description` text NOT NULL,
  `unit` varchar(80) DEFAULT NULL,
  `quantity_received` decimal(18,4) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_goods_receipt_item_line` (`gr_id`,`line_number`),
  KEY `po_item_id` (`po_item_id`),
  KEY `product_id` (`product_id`),
  KEY `ix_goods_receipt_items_gr_id` (`gr_id`),
  CONSTRAINT `goods_receipt_items_ibfk_1` FOREIGN KEY (`gr_id`) REFERENCES `goods_receipts` (`id`),
  CONSTRAINT `goods_receipt_items_ibfk_2` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`id`),
  CONSTRAINT `goods_receipt_items_ibfk_3` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `goods_receipt_items`
--

LOCK TABLES `goods_receipt_items` WRITE;
/*!40000 ALTER TABLE `goods_receipt_items` DISABLE KEYS */;
INSERT INTO `goods_receipt_items` VALUES (1,1,1,1,NULL,'CHUỘT KHÔNG DÂY LOGITECH M331 ĐEN- IMEI: MA.260.B','Cái',1.0000),(2,1,2,2,NULL,'TAI NGHE KHÔNG DÂY XIAOMI REDMI BUDS 3 LITE TRẮNG- IMEI: TN.BT.13.W','Cái',1.0000);
/*!40000 ALTER TABLE `goods_receipt_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `goods_receipts`
--

DROP TABLE IF EXISTS `goods_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `goods_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `receipt_number` varchar(80) NOT NULL,
  `po_number` varchar(80) NOT NULL,
  `received_at` datetime NOT NULL,
  `po_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_goods_receipts_receipt_number` (`receipt_number`),
  KEY `ix_goods_receipts_po_number` (`po_number`),
  KEY `fk_goods_receipts_po` (`po_id`),
  CONSTRAINT `fk_goods_receipts_po` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `goods_receipts`
--

LOCK TABLES `goods_receipts` WRITE;
/*!40000 ALTER TABLE `goods_receipts` DISABLE KEYS */;
INSERT INTO `goods_receipts` VALUES (1,'GR-DEMO-HD001','PO-DEMO-HD001','2026-10-22 11:27:47',1);
/*!40000 ALTER TABLE `goods_receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_approvals`
--

DROP TABLE IF EXISTS `invoice_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_approvals` (
  `approval_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `review_id` int NOT NULL,
  `reconciliation_run_id` int NOT NULL,
  `approver_user_id` int DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `approved_amount` decimal(18,2) NOT NULL,
  `currency_code` varchar(3) NOT NULL,
  `snapshot_json` json NOT NULL,
  `content_hash` varchar(64) NOT NULL,
  `decided_at` datetime NOT NULL,
  PRIMARY KEY (`approval_id`),
  KEY `review_id` (`review_id`),
  KEY `reconciliation_run_id` (`reconciliation_run_id`),
  KEY `approver_user_id` (`approver_user_id`),
  KEY `ix_invoice_approvals_invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_approvals_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `invoice_approvals_ibfk_2` FOREIGN KEY (`review_id`) REFERENCES `invoice_reviews` (`review_id`),
  CONSTRAINT `invoice_approvals_ibfk_3` FOREIGN KEY (`reconciliation_run_id`) REFERENCES `reconciliation_runs` (`reconciliation_run_id`),
  CONSTRAINT `invoice_approvals_ibfk_4` FOREIGN KEY (`approver_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_approvals`
--

LOCK TABLES `invoice_approvals` WRITE;
/*!40000 ALTER TABLE `invoice_approvals` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoice_approvals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_files`
--

DROP TABLE IF EXISTS `invoice_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_files` (
  `invoice_file_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `relative_path` varchar(700) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `size_bytes` int NOT NULL,
  `sha256` varchar(64) DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`invoice_file_id`),
  UNIQUE KEY `sha256` (`sha256`),
  KEY `ix_invoice_files_invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_files_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_files`
--

LOCK TABLES `invoice_files` WRITE;
/*!40000 ALTER TABLE `invoice_files` DISABLE KEYS */;
INSERT INTO `invoice_files` VALUES (1,1,'HD_001.pdf','demo/HD_001.pdf','application/pdf',338668,'8c5c584a68a63ca5cbd6890bf29a4b1780ff545a3f6bbc7feb806b9def1cf9ab',1,'2026-10-22 12:07:32');
/*!40000 ALTER TABLE `invoice_files` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_ground_truth_fields`
--

DROP TABLE IF EXISTS `invoice_ground_truth_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_ground_truth_fields` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dataset_invoice_id` int NOT NULL,
  `field_key` varchar(80) NOT NULL,
  `raw_value` text NOT NULL,
  `normalized_value` text,
  `source_column` varchar(255) NOT NULL,
  `annotation_status` varchar(32) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_ground_truth_field` (`dataset_invoice_id`,`field_key`),
  KEY `ix_invoice_ground_truth_fields_dataset_invoice_id` (`dataset_invoice_id`),
  CONSTRAINT `invoice_ground_truth_fields_ibfk_1` FOREIGN KEY (`dataset_invoice_id`) REFERENCES `dataset_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_ground_truth_fields`
--

LOCK TABLES `invoice_ground_truth_fields` WRITE;
/*!40000 ALTER TABLE `invoice_ground_truth_fields` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoice_ground_truth_fields` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_items`
--

DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `line_number` int NOT NULL,
  `item_description` text NOT NULL,
  `unit` varchar(80) DEFAULT NULL,
  `quantity` decimal(18,4) DEFAULT NULL,
  `unit_price` decimal(18,2) DEFAULT NULL,
  `line_total` decimal(18,2) DEFAULT NULL,
  `data_source` varchar(32) NOT NULL,
  `created_at` datetime NOT NULL,
  `product_id` int DEFAULT NULL,
  `tax_rate` decimal(7,4) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_item_line` (`invoice_id`,`line_number`),
  KEY `ix_invoice_items_invoice_id` (`invoice_id`),
  KEY `fk_invoice_items_product` (`product_id`),
  CONSTRAINT `fk_invoice_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `invoice_items_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_items`
--

LOCK TABLES `invoice_items` WRITE;
/*!40000 ALTER TABLE `invoice_items` DISABLE KEYS */;
INSERT INTO `invoice_items` VALUES (1,1,1,'CHUỘT KHÔNG DÂY LOGITECH M331 ĐEN- IMEI: MA.260.B','Cái',1.0000,300000.00,330000.00,'demo_seed','2026-10-22 11:27:47',NULL,NULL),(2,1,2,'TAI NGHE KHÔNG DÂY XIAOMI REDMI BUDS 3 LITE TRẮNG- IMEI: TN.BT.13.W','Cái',1.0000,409091.00,450000.00,'demo_seed','2026-10-22 11:27:47',NULL,NULL);
/*!40000 ALTER TABLE `invoice_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_ocr_fields`
--

DROP TABLE IF EXISTS `invoice_ocr_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_ocr_fields` (
  `ocr_field_id` int NOT NULL AUTO_INCREMENT,
  `ocr_run_id` int NOT NULL,
  `field_key` varchar(80) NOT NULL,
  `value_text` text,
  `normalized_value` text,
  `confidence` decimal(7,6) DEFAULT NULL,
  `page_number` int DEFAULT NULL,
  `bbox_json` json DEFAULT NULL,
  `warning` text,
  PRIMARY KEY (`ocr_field_id`),
  KEY `ix_invoice_ocr_fields_ocr_run_id` (`ocr_run_id`),
  CONSTRAINT `invoice_ocr_fields_ibfk_1` FOREIGN KEY (`ocr_run_id`) REFERENCES `invoice_ocr_runs` (`ocr_run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_ocr_fields`
--

LOCK TABLES `invoice_ocr_fields` WRITE;
/*!40000 ALTER TABLE `invoice_ocr_fields` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoice_ocr_fields` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_ocr_runs`
--

DROP TABLE IF EXISTS `invoice_ocr_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_ocr_runs` (
  `ocr_run_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `engine` varchar(80) NOT NULL,
  `model_name` varchar(160) DEFAULT NULL,
  `model_version` varchar(100) DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `duration_seconds` decimal(12,4) DEFAULT NULL,
  `config_json` json DEFAULT NULL,
  PRIMARY KEY (`ocr_run_id`),
  KEY `ix_invoice_ocr_runs_invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_ocr_runs_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_ocr_runs`
--

LOCK TABLES `invoice_ocr_runs` WRITE;
/*!40000 ALTER TABLE `invoice_ocr_runs` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoice_ocr_runs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_payments`
--

DROP TABLE IF EXISTS `invoice_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_payments` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `approval_id` int NOT NULL,
  `recorded_by_user_id` int DEFAULT NULL,
  `amount` decimal(18,2) NOT NULL,
  `currency_code` varchar(3) NOT NULL,
  `paid_at` datetime NOT NULL,
  `method` varchar(40) DEFAULT NULL,
  `reference` varchar(160) DEFAULT NULL,
  `note` text NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`payment_id`),
  KEY `recorded_by_user_id` (`recorded_by_user_id`),
  KEY `ix_invoice_payments_approval_id` (`approval_id`),
  CONSTRAINT `invoice_payments_ibfk_1` FOREIGN KEY (`approval_id`) REFERENCES `invoice_approvals` (`approval_id`),
  CONSTRAINT `invoice_payments_ibfk_2` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_payments`
--

LOCK TABLES `invoice_payments` WRITE;
/*!40000 ALTER TABLE `invoice_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoice_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_reviews`
--

DROP TABLE IF EXISTS `invoice_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_reviews` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `reviewer_user_id` int DEFAULT NULL,
  `revision_number` int NOT NULL,
  `status` varchar(32) NOT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` text NOT NULL,
  `snapshot_json` json NOT NULL,
  `content_hash` varchar(64) DEFAULT NULL,
  `invalidated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `uq_invoice_review_revision` (`invoice_id`,`revision_number`),
  KEY `reviewer_user_id` (`reviewer_user_id`),
  KEY `ix_invoice_reviews_invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_reviews_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `invoice_reviews_ibfk_2` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_reviews`
--

LOCK TABLES `invoice_reviews` WRITE;
/*!40000 ALTER TABLE `invoice_reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoice_reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `original_name` varchar(255) NOT NULL,
  `stored_path` varchar(500) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `sha256` varchar(64) DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `seller_tax_code` varchar(32) NOT NULL,
  `buyer_tax_code` varchar(32) NOT NULL,
  `invoice_number` varchar(80) NOT NULL,
  `invoice_date` varchar(32) NOT NULL,
  `total_amount` decimal(18,2) DEFAULT NULL,
  `ocr_text` text NOT NULL,
  `ocr_blocks` json NOT NULL,
  `ocr_confidence` float DEFAULT NULL,
  `warnings` json NOT NULL,
  `po_number` varchar(80) NOT NULL,
  `review_note` text NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `seller_supplier_id` int DEFAULT NULL,
  `po_id` int DEFAULT NULL,
  `po_reference_text` varchar(80) NOT NULL DEFAULT '',
  `currency_code` char(3) NOT NULL DEFAULT 'VND',
  `subtotal_amount` decimal(18,2) DEFAULT NULL,
  `tax_amount` decimal(18,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_invoices_sha256` (`sha256`),
  KEY `ix_invoices_status` (`status`),
  KEY `ix_invoices_seller_tax_code` (`seller_tax_code`),
  KEY `fk_invoices_seller_supplier` (`seller_supplier_id`),
  KEY `fk_invoices_po` (`po_id`),
  CONSTRAINT `fk_invoices_po` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `fk_invoices_seller_supplier` FOREIGN KEY (`seller_supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
INSERT INTO `invoices` VALUES (1,'HD_001.pdf','/app/backend/data/uploads/demo/HD_001.pdf','application/pdf','8c5c584a68a63ca5cbd6890bf29a4b1780ff545a3f6bbc7feb806b9def1cf9ab','needs_review','0108075931','5000863573','1C22THT / 506572','2022-10-09',780000.00,'','[]',NULL,'[]','PO-DEMO-HD001','Các trường hóa đơn theo PDF HD_001. PO-DEMO-HD001 và GR-DEMO-HD001 là chứng từ minh họa dựng theo hóa đơn, không phải chứng từ gốc.','2026-10-22 11:27:47','2026-10-22 11:27:47',1,1,'PO-DEMO-HD001','VND',NULL,NULL);
/*!40000 ALTER TABLE `invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(80) DEFAULT NULL,
  `product_name` varchar(500) NOT NULL,
  `unit` varchar(80) DEFAULT NULL,
  `active` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_id` int NOT NULL,
  `line_number` int NOT NULL,
  `product_id` int DEFAULT NULL,
  `item_description` text NOT NULL,
  `unit` varchar(80) DEFAULT NULL,
  `quantity` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `line_total` decimal(18,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchase_order_item_line` (`po_id`,`line_number`),
  KEY `product_id` (`product_id`),
  KEY `ix_purchase_order_items_po_id` (`po_id`),
  CONSTRAINT `purchase_order_items_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `purchase_order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_items`
--

LOCK TABLES `purchase_order_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_items` DISABLE KEYS */;
INSERT INTO `purchase_order_items` VALUES (1,1,1,NULL,'CHUỘT KHÔNG DÂY LOGITECH M331 ĐEN- IMEI: MA.260.B','Cái',1.0000,300000.00,330000.00),(2,1,2,NULL,'TAI NGHE KHÔNG DÂY XIAOMI REDMI BUDS 3 LITE TRẮNG- IMEI: TN.BT.13.W','Cái',1.0000,409091.00,450000.00);
/*!40000 ALTER TABLE `purchase_order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_number` varchar(80) NOT NULL,
  `supplier_tax_code` varchar(32) NOT NULL,
  `total_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `status` varchar(32) NOT NULL,
  `created_at` datetime NOT NULL,
  `supplier_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_purchase_orders_po_number` (`po_number`),
  KEY `ix_purchase_orders_supplier_tax_code` (`supplier_tax_code`),
  KEY `fk_purchase_orders_supplier` (`supplier_id`),
  CONSTRAINT `fk_purchase_orders_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES (1,'PO-DEMO-HD001','0108075931',780000.00,'open','2026-10-22 11:27:47',1);
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reconciliation_findings`
--

DROP TABLE IF EXISTS `reconciliation_findings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reconciliation_findings` (
  `finding_id` int NOT NULL AUTO_INCREMENT,
  `reconciliation_run_id` int NOT NULL,
  `allocation_id` int DEFAULT NULL,
  `finding_type` varchar(80) NOT NULL,
  `severity` varchar(24) NOT NULL,
  `expected_value` decimal(18,4) DEFAULT NULL,
  `actual_value` decimal(18,4) DEFAULT NULL,
  `difference_value` decimal(18,4) DEFAULT NULL,
  `details` text NOT NULL,
  PRIMARY KEY (`finding_id`),
  KEY `allocation_id` (`allocation_id`),
  KEY `ix_reconciliation_findings_reconciliation_run_id` (`reconciliation_run_id`),
  CONSTRAINT `reconciliation_findings_ibfk_1` FOREIGN KEY (`reconciliation_run_id`) REFERENCES `reconciliation_runs` (`reconciliation_run_id`),
  CONSTRAINT `reconciliation_findings_ibfk_2` FOREIGN KEY (`allocation_id`) REFERENCES `reconciliation_line_allocations` (`allocation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reconciliation_findings`
--

LOCK TABLES `reconciliation_findings` WRITE;
/*!40000 ALTER TABLE `reconciliation_findings` DISABLE KEYS */;
/*!40000 ALTER TABLE `reconciliation_findings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reconciliation_line_allocations`
--

DROP TABLE IF EXISTS `reconciliation_line_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reconciliation_line_allocations` (
  `allocation_id` int NOT NULL AUTO_INCREMENT,
  `reconciliation_run_id` int NOT NULL,
  `invoice_item_id` int NOT NULL,
  `po_item_id` int DEFAULT NULL,
  `gr_item_id` int DEFAULT NULL,
  `allocated_quantity` decimal(18,4) DEFAULT NULL,
  `allocated_amount` decimal(18,2) DEFAULT NULL,
  `invoice_snapshot_json` json NOT NULL,
  `po_snapshot_json` json NOT NULL,
  `gr_snapshot_json` json NOT NULL,
  PRIMARY KEY (`allocation_id`),
  KEY `po_item_id` (`po_item_id`),
  KEY `gr_item_id` (`gr_item_id`),
  KEY `ix_reconciliation_line_allocations_reconciliation_run_id` (`reconciliation_run_id`),
  KEY `ix_reconciliation_line_allocations_invoice_item_id` (`invoice_item_id`),
  CONSTRAINT `reconciliation_line_allocations_ibfk_1` FOREIGN KEY (`reconciliation_run_id`) REFERENCES `reconciliation_runs` (`reconciliation_run_id`),
  CONSTRAINT `reconciliation_line_allocations_ibfk_2` FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items` (`id`),
  CONSTRAINT `reconciliation_line_allocations_ibfk_3` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`id`),
  CONSTRAINT `reconciliation_line_allocations_ibfk_4` FOREIGN KEY (`gr_item_id`) REFERENCES `goods_receipt_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reconciliation_line_allocations`
--

LOCK TABLES `reconciliation_line_allocations` WRITE;
/*!40000 ALTER TABLE `reconciliation_line_allocations` DISABLE KEYS */;
/*!40000 ALTER TABLE `reconciliation_line_allocations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reconciliation_run_goods_receipts`
--

DROP TABLE IF EXISTS `reconciliation_run_goods_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reconciliation_run_goods_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reconciliation_run_id` int NOT NULL,
  `gr_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reconciliation_run_gr` (`reconciliation_run_id`,`gr_id`),
  KEY `ix_reconciliation_run_goods_receipts_gr_id` (`gr_id`),
  KEY `ix_reconciliation_run_goods_receipts_reconciliation_run_id` (`reconciliation_run_id`),
  CONSTRAINT `reconciliation_run_goods_receipts_ibfk_1` FOREIGN KEY (`reconciliation_run_id`) REFERENCES `reconciliation_runs` (`reconciliation_run_id`),
  CONSTRAINT `reconciliation_run_goods_receipts_ibfk_2` FOREIGN KEY (`gr_id`) REFERENCES `goods_receipts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reconciliation_run_goods_receipts`
--

LOCK TABLES `reconciliation_run_goods_receipts` WRITE;
/*!40000 ALTER TABLE `reconciliation_run_goods_receipts` DISABLE KEYS */;
/*!40000 ALTER TABLE `reconciliation_run_goods_receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reconciliation_runs`
--

DROP TABLE IF EXISTS `reconciliation_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reconciliation_runs` (
  `reconciliation_run_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `review_id` int DEFAULT NULL,
  `po_id` int DEFAULT NULL,
  `gr_id` int DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `result_json` json NOT NULL,
  `amount_tolerance` decimal(18,2) NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `run_by_user_id` int DEFAULT NULL,
  PRIMARY KEY (`reconciliation_run_id`),
  KEY `review_id` (`review_id`),
  KEY `po_id` (`po_id`),
  KEY `gr_id` (`gr_id`),
  KEY `run_by_user_id` (`run_by_user_id`),
  KEY `ix_reconciliation_runs_invoice_id` (`invoice_id`),
  CONSTRAINT `reconciliation_runs_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `reconciliation_runs_ibfk_2` FOREIGN KEY (`review_id`) REFERENCES `invoice_reviews` (`review_id`),
  CONSTRAINT `reconciliation_runs_ibfk_3` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `reconciliation_runs_ibfk_4` FOREIGN KEY (`gr_id`) REFERENCES `goods_receipts` (`id`),
  CONSTRAINT `reconciliation_runs_ibfk_5` FOREIGN KEY (`run_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reconciliation_runs`
--

LOCK TABLES `reconciliation_runs` WRITE;
/*!40000 ALTER TABLE `reconciliation_runs` DISABLE KEYS */;
/*!40000 ALTER TABLE `reconciliation_runs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `revision` varchar(100) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`revision`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migrations`
--

LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES ('0001_normalize_operational_data','2026-10-22 12:09:40');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tax_code` varchar(32) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_suppliers_tax_code` (`tax_code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES (1,'0108075931','Công ty TNHH Thương Mại Tổng hợp HTV','','2026-10-22 11:27:47');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(40) NOT NULL,
  `active` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin@gmail.com','$2b$12$SzSpyxhOdLff4rpX3NgZ8.z0JO.9HXXONzpRcu6eBJ1dDnzWat/U6','admin',1,'2026-10-22 11:27:47'),(2,'ketoan@gmail.com','$2b$12$1wlWQKGKKcIJy6UNSo6h5eA0pyPeshfPV1HCVdyYpccj9q/uqZoQ2','accountant',1,'2026-10-22 11:27:47'),(3,'ketoantruong@gmail.com','$2b$12$ji1VY7CJ682eNW66XTFJquKL3q/1/frRlT6.Jy6Wj25T7TtVHsRDq','chief_accountant',1,'2026-10-22 11:27:47');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'invoice_reconciliation'
--

--
-- Dumping routines for database 'invoice_reconciliation'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-23 10:33:26
