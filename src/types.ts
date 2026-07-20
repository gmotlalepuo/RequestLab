export type KeyValue = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type BodyMode = "none" | "json" | "raw" | "form";

export type AuthType = "none" | "bearer" | "basic";

export type RequestAuth = {
  type: AuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
};

export type Workspace = {
  id: string;
  ownerId?: string;
  ownerEmail?: string;
  name: string;
  createdAt: string;
};

export type WorkspaceMember = {
  workspaceId: string;
  userId: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
};

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  workspaceName?: string;
  email: string;
  invitedBy: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  respondedAt: string | null;
};

export type Environment = {
  id: string;
  workspaceId: string;
  collectionId: string;
  name: string;
  variables: KeyValue[];
  createdAt: string;
};

export type Collection = {
  id: string;
  workspaceId: string;
  createdBy?: string | null;
  name: string;
  description: string;
  createdAt: string;
};

export type Folder = {
  id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  description: string;
  isStarred: boolean;
  createdAt: string;
};

export type ApiRequest = {
  id: string;
  collectionId: string;
  folderId: string | null;
  name: string;
  documentation?: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyMode: BodyMode;
  bodyRaw: string;
  bodyForm: KeyValue[];
  auth: RequestAuth;
  environment?: KeyValue[];
  createdAt: string;
};

export type ApiResponse = {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: { key: string; value: string }[];
  body: string;
};
