// Minimal asynchronous IndexedDB shim for the client-core tests.
//
// The workbench keeps imported/exported media in IndexedDB. `tests/client-core.test.mjs`
// loads client.js in a `node:vm` sandbox, so the media store needs an in-memory
// stand-in that supports exactly what client.js uses:
//   indexedDB.open(name, version), onupgradeneeded/onsuccess,
//   database.objectStoreNames.contains/createObjectStore,
//   transaction('readwrite'|'readonly').objectStore(name).put/get/getAll/delete,
//   transaction oncomplete/onerror/onabort.
//
// It is deliberately tiny and synchronous-in-a-macrotask; no external packages.

export function createFakeIndexedDb() {
  const databases = new Map();

  function makeDatabase(name) {
    const stores = new Map();
    return {
      name,
      version: 0,
      _stores: stores,
      objectStoreNames: { contains: (storeName) => stores.has(storeName) },
      createObjectStore(storeName) {
        if (!stores.has(storeName)) stores.set(storeName, new Map());
        return { name: storeName };
      },
      transaction(storeNames) {
        const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
        const store = stores.get(storeName);
        if (store === undefined) throw new Error('no such store ' + storeName);
        let pending = 0;
        let finished = false;
        const transaction = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore() { return api; },
        };
        const finish = () => {
          if (finished || pending > 0) return;
          finished = true;
          setTimeout(() => {
            if (typeof transaction.oncomplete === 'function') transaction.oncomplete();
          }, 0);
        };
        const queue = (fn) => {
          pending += 1;
          setTimeout(() => {
            let failed = false;
            try { fn(); } catch { failed = true; }
            pending -= 1;
            if (failed) {
              setTimeout(() => {
                if (typeof transaction.onerror === 'function') transaction.onerror();
              }, 0);
              return;
            }
            finish();
          }, 0);
        };
        const api = {
          put(value, key) {
            const request = { result: key, onsuccess: null, onerror: null };
            queue(() => {
              store.set(key, value);
              if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
            });
            return request;
          },
          get(key) {
            const request = { result: undefined, onsuccess: null, onerror: null };
            queue(() => {
              request.result = store.get(key);
              if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
            });
            return request;
          },
          getAll() {
            const request = { result: [], onsuccess: null, onerror: null };
            queue(() => {
              request.result = [...store.values()];
              if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
            });
            return request;
          },
          delete(key) {
            const request = { result: undefined, onsuccess: null, onerror: null };
            queue(() => {
              store.delete(key);
              if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
            });
            return request;
          },
        };
        return transaction;
      },
    };
  }

  return {
    _databases: databases,
    _stores(databaseName) {
      return databases.get(databaseName)?._stores ?? new Map();
    },
    open(name, version) {
      const request = {
        result: undefined,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      setTimeout(() => {
        let database = databases.get(name);
        const needsUpgrade = database === undefined || database.version < version;
        if (database === undefined) {
          database = makeDatabase(name);
          databases.set(name, database);
        }
        request.result = database;
        if (needsUpgrade) {
          database.version = version;
          const upgrade = request.onupgradeneeded;
          const afterUpgrade = () => {
            setTimeout(() => {
              if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
            }, 0);
          };
          if (typeof upgrade === 'function') {
            setTimeout(() => {
              try { upgrade({ target: request }); } catch { /* ignored */ }
              afterUpgrade();
            }, 0);
          } else {
            afterUpgrade();
          }
        } else {
          setTimeout(() => {
            if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
          }, 0);
        }
      }, 0);
      return request;
    },
  };
}
