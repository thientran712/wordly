import test from "node:test";
import assert from "node:assert/strict";
import { deleteAccount } from "../../src/lib/auth/delete-account.js";

// Client giả: ghi lại thứ tự gọi để kiểm tra luồng xoá.
function fakeClients({ slotsError = null, deleteUserError = null } = {}) {
  const calls = [];
  const userClient = {
    from(table) {
      return {
        delete() {
          return {
            eq(col, val) {
              calls.push(["delete", table, col, val]);
              return Promise.resolve({ error: slotsError });
            },
          };
        },
      };
    },
  };
  const adminClient = {
    auth: {
      admin: {
        deleteUser(id) {
          calls.push(["deleteUser", id]);
          return Promise.resolve({ error: deleteUserError });
        },
      },
    },
  };
  return { calls, userClient, adminClient };
}

test("deleteAccount: xoá email_slots (không có ON DELETE CASCADE) trước, rồi mới xoá user", async () => {
  const { calls, userClient, adminClient } = fakeClients();
  const result = await deleteAccount({ userId: "u-1", userClient, adminClient });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    ["delete", "email_slots", "user_id", "u-1"],
    ["deleteUser", "u-1"],
  ]);
});

test("deleteAccount: xoá email_slots lỗi thì KHÔNG xoá user (tránh xoá nửa vời)", async () => {
  const { calls, userClient, adminClient } = fakeClients({ slotsError: { message: "boom" } });
  const result = await deleteAccount({ userId: "u-1", userClient, adminClient });
  assert.equal(result.ok, false);
  assert.ok(!calls.some((c) => c[0] === "deleteUser"));
});

test("deleteAccount: xoá user lỗi thì báo lỗi", async () => {
  const { userClient, adminClient } = fakeClients({ deleteUserError: { message: "nope" } });
  const result = await deleteAccount({ userId: "u-1", userClient, adminClient });
  assert.equal(result.ok, false);
});

test("deleteAccount: thiếu userId thì không gọi gì cả", async () => {
  const { calls, userClient, adminClient } = fakeClients();
  const result = await deleteAccount({ userId: "", userClient, adminClient });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});
