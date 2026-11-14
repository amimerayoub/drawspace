import { Account, Client } from 'appwrite';

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '';

if (!projectId && import.meta.env.PROD) {
  console.error('VITE_APPWRITE_PROJECT_ID is required for production authentication.');
}

const client = new Client().setEndpoint(endpoint).setProject(projectId);
export const appwriteAccount = new Account(client);
