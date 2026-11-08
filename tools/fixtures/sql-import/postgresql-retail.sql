-- Multi-tenant retailer. Separate migrations add constraints once all tables exist.
CREATE TABLE retail.account (
    account_id UUID PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL
);
CREATE TABLE retail.customer (
    account_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    email VARCHAR(254) NOT NULL,
    "shipping city" TEXT,
    PRIMARY KEY (account_id, customer_id),
    UNIQUE (account_id, email)
);
CREATE TABLE retail.product (
    account_id UUID NOT NULL,
    sku VARCHAR(32) NOT NULL,
    "Étiquette" TEXT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (account_id, sku)
);
CREATE TABLE retail.purchase (
    account_id UUID NOT NULL,
    purchase_id BIGINT NOT NULL,
    customer_id UUID,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (account_id, purchase_id)
);
CREATE TABLE retail.purchase_line (
    account_id UUID NOT NULL,
    purchase_id BIGINT NOT NULL,
    line_no INTEGER NOT NULL,
    sku VARCHAR(32) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (account_id, purchase_id, line_no)
);
ALTER TABLE retail.customer ADD CONSTRAINT customer_account
    FOREIGN KEY (account_id) REFERENCES retail.account (account_id);
ALTER TABLE retail.product ADD CONSTRAINT product_account
    FOREIGN KEY (account_id) REFERENCES retail.account (account_id);
ALTER TABLE retail.purchase ADD CONSTRAINT purchase_customer
    FOREIGN KEY (account_id, customer_id) REFERENCES retail.customer (account_id, customer_id);
ALTER TABLE retail.purchase_line ADD CONSTRAINT line_purchase
    FOREIGN KEY (account_id, purchase_id) REFERENCES retail.purchase (account_id, purchase_id) ON DELETE CASCADE;
ALTER TABLE retail.purchase_line ADD CONSTRAINT line_product
    FOREIGN KEY (account_id, sku) REFERENCES retail.product (account_id, sku);
