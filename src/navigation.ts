export type RootStackParamList = {
  Workspaces: undefined;
  Workspace: { workspaceId: string; workspaceName: string };
  Collection: {
    collectionId: string;
    collectionName: string;
    folderId: string | null;
    folderName?: string;
  };
  Request: { requestId: string };
};
