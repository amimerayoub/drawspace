import { Account, Client, ID, Query, Storage, TablesDB, Users } from 'node-appwrite';
import type { ServerConfig } from '../config/env';
import { recordAppwriteCall } from '../monitoring/appwriteStats';

export interface AppwriteDatabase {
  accountForJwt(jwt: string): Account;
  tables: TablesDB;
  users: Users;
  storage: Storage;
  databaseId: string;
  newId(): string;
}

// Counts every SDK call (table + method) without touching payloads or results.
function counted<T extends object>(target: T, tableFor: (method: string, args: unknown[]) => string): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof prop !== 'string' || typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        recordAppwriteCall(tableFor(prop, args), prop);
        return (value as (...args: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
}

export function createAppwriteDatabase(config: ServerConfig): AppwriteDatabase {
  const adminClient = new Client()
    .setEndpoint(config.appwriteEndpoint)
    .setProject(config.appwriteProjectId)
    .setKey(config.appwriteApiKey);
  return {
    accountForJwt(jwt) {
      const client = new Client().setEndpoint(config.appwriteEndpoint).setProject(config.appwriteProjectId).setJWT(jwt);
      return counted(new Account(client), () => 'account');
    },
    tables: counted(new TablesDB(adminClient), (_method, args) => (typeof args[1] === 'string' ? args[1] : '(database)')),
    users: counted(new Users(adminClient), (method) => (method === 'createJWT' ? 'jwts' : 'users')),
    storage: counted(new Storage(adminClient), () => 'storage'),
    databaseId: config.databaseId,
    newId: () => ID.unique(),
  };
}

export { Query, ID };
