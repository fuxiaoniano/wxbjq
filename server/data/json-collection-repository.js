"use strict";

const crypto = require("crypto");
const { mutateJsonArray, readJsonFile } = require("../storage");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createJsonCollectionRepository(filePath, options = {}) {
  const idPrefix = options.idPrefix || "record";

  async function list(predicate = null) {
    const rows = await readJsonFile(filePath, []);
    if (!Array.isArray(rows)) throw new Error("数据文件格式不正确");
    return clone(predicate ? rows.filter(predicate) : rows);
  }

  async function findOne(predicate) {
    const rows = await readJsonFile(filePath, []);
    if (!Array.isArray(rows)) throw new Error("数据文件格式不正确");
    return clone(rows.find(predicate) || null);
  }

  async function findById(id) {
    return findOne((row) => row.id === id);
  }

  async function insert(record) {
    return mutateJsonArray(filePath, (rows) => {
      const now = new Date().toISOString();
      const next = {
        ...clone(record),
        id: record.id || createId(idPrefix),
        createdAt: record.createdAt || now,
        updatedAt: record.updatedAt || now,
      };
      rows.push(next);
      return clone(next);
    });
  }

  async function updateById(id, updater) {
    return mutateJsonArray(filePath, async (rows) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return null;
      const patch = typeof updater === "function" ? await updater(clone(rows[index])) : updater;
      rows[index] = {
        ...rows[index],
        ...clone(patch),
        id: rows[index].id,
        updatedAt: new Date().toISOString(),
      };
      return clone(rows[index]);
    });
  }

  async function removeById(id) {
    return mutateJsonArray(filePath, (rows) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return null;
      return clone(rows.splice(index, 1)[0]);
    });
  }

  async function transaction(callback) {
    return mutateJsonArray(filePath, async (rows) => callback(rows));
  }

  return {
    filePath,
    findById,
    findOne,
    insert,
    list,
    removeById,
    transaction,
    updateById,
  };
}

module.exports = {
  createId,
  createJsonCollectionRepository,
};
