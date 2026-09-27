import { Schema } from './validation';

// openapi.yamlの*Inputスキーマに対応する(docs/specs/purchase-sales/openapi.yaml)。
// ここに無い項目はリクエストに含まれていても保存しない

export const itemSchema: Schema = {
  item_name: { type: 'string', required: true },
  unit: { type: 'string', required: true },
  standard_price: { type: 'number' },
  tax_category: { type: 'taxCategory', required: true },
  is_active: { type: 'boolean', default: true },
};

export const supplierSchema: Schema = {
  supplier_name: { type: 'string', required: true },
  postal_code: { type: 'string' },
  address: { type: 'string' },
  phone_number: { type: 'string' },
  email: { type: 'string' },
  is_active: { type: 'boolean', default: true },
};

export const menuSchema: Schema = {
  menu_name: { type: 'string', required: true },
  category: { type: 'string', required: true },
  standard_price: { type: 'number', required: true },
  tax_category: { type: 'taxCategory', required: true },
  is_active: { type: 'boolean', default: true },
};

export const taxRateSchema: Schema = {
  tax_category: { type: 'taxCategory', required: true },
  description: { type: 'string', required: true },
  rate: { type: 'number', required: true },
  valid_from: { type: 'date', required: true },
  valid_to: { type: 'date' },
};

// tax_category・valid_fromはパスパラメータで指定するため含めない
export const taxRateUpdateSchema: Schema = {
  description: { type: 'string', required: true },
  rate: { type: 'number', required: true },
  valid_to: { type: 'date' },
};

export const purchaseHeaderSchema: Schema = {
  supplier_id: { type: 'integer', required: true },
  purchase_date: { type: 'date', required: true },
  delivery_date: { type: 'date' },
  subtotal: { type: 'number', required: true },
  tax_amount: { type: 'number', required: true },
  total_amount: { type: 'number', required: true },
  remarks: { type: 'string' },
};

export const purchaseDetailSchema: Schema = {
  item_id: { type: 'integer', required: true },
  quantity: { type: 'number', required: true },
  unit_price: { type: 'number', required: true },
  amount: { type: 'number', required: true },
  tax_rate: { type: 'number', required: true },
};

export const salesHeaderSchema: Schema = {
  sales_datetime: { type: 'dateTime', required: true },
  business_date: { type: 'date', required: true },
  table_no: { type: 'string' },
  customer_count: { type: 'integer', default: 1 },
  subtotal: { type: 'number', required: true },
  tax_amount: { type: 'number', required: true },
  discount_amount: { type: 'number', default: 0 },
  total_amount: { type: 'number', required: true },
  payment_method: { type: 'string', required: true },
  remarks: { type: 'string' },
};

export const salesDetailSchema: Schema = {
  menu_id: { type: 'integer', required: true },
  quantity: { type: 'integer', required: true },
  unit_price: { type: 'number', required: true },
  amount: { type: 'number', required: true },
  tax_rate: { type: 'number', required: true },
};
