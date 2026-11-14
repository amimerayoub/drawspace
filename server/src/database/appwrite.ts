import { Account, Client, ID, Query, TablesDB, Users } from 'node-appwrite';
import type { ServerConfig } from '../config/env';

export interface AppwriteDatabase {
  accountForJwt(jwt: string): Account;
  tables: TablesDB;
  users: Users;
  databaseId: string;
  newId(): string;
}

export function createAppwriteDatabase(config: ServerConfig): AppwriteDatabase {
  const adminClient = new Client()
    .setEndpoint(config.appwriteEndpoint)
    .setProject(config.appwriteProjectId)
    .setKey(config.appwriteApiKey);
  return {
    accountForJwt(jwt) {
      const client = new Client().setEndpoint(config.appwriteEndpoint).setProject(config.appwriteProjectId).setJWT(jwt);
      return new Account(client);
    },
    tables: new TablesDB(adminClient),
    users: new Users(adminClient),
    databaseId: config.databaseId,
    newId: () => ID.unique(),
  };
}

export { Query };
