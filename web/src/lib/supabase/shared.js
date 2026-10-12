import { createAdminClient } from "./admin";
import { restrictToSharedTables } from "./shared-tables";

// Service role cho bảng dùng chung (xem shared-tables.js) trong route của
// người dùng. Dữ liệu riêng người dùng → createClient() từ ./server.
export function createSharedClient() {
  return restrictToSharedTables(createAdminClient());
}
