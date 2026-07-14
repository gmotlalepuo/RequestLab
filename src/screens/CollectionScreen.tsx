import React, { useCallback, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { RootStackParamList } from "../navigation";
import { repo } from "../data";
import { ApiRequest, Folder } from "../types";
import { newId } from "../lib/id";
import { confirmAction, notify } from "../lib/dialogs";
import { colors, spacing } from "../theme";
import PromptModal from "../components/PromptModal";
import ActionSheet from "../components/ActionSheet";
import MethodBadge from "../components/MethodBadge";
import EmptyState from "../components/EmptyState";

type Props = NativeStackScreenProps<RootStackParamList, "Collection">;

type ListItem =
  { type: "folder"; folder: Folder } | { type: "request"; request: ApiRequest };

type ListSection = { title: string; data: ListItem[] };

type PromptState =
  | { mode: "createFolder" }
  | { mode: "renameFolder"; folder: Folder }
  | { mode: "createRequest" }
  | { mode: "renameRequest"; request: ApiRequest }
  | null;

type SheetState =
  | { kind: "add" }
  | { kind: "folder"; folder: Folder }
  | { kind: "request"; request: ApiRequest }
  | null;

export default function CollectionScreen({ navigation, route }: Props) {
  const { collectionId, collectionName, folderId, folderName } = route.params;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [requests, setRequests] = useState<ApiRequest[]>([]);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [sheet, setSheet] = useState<SheetState>(null);

  const load = useCallback(() => {
    Promise.all([
      repo.listFolders(collectionId),
      repo.listRequests(collectionId),
    ])
      .then(([allFolders, allRequests]) => {
        setFolders(allFolders.filter((f) => f.parentFolderId === folderId));
        setRequests(allRequests.filter((r) => r.folderId === folderId));
      })
      .catch((error: Error) => notify(error.message));
  }, [collectionId, folderId]);

  useFocusEffect(load);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: folderName ?? collectionName,
      headerRight: () => (
        <Pressable onPress={() => setSheet({ kind: "add" })} hitSlop={8}>
          <Text style={styles.headerAction}>＋</Text>
        </Pressable>
      ),
    });
  }, [navigation, collectionName, folderName]);

  const handleSubmit = async (name: string) => {
    try {
      if (prompt?.mode === "createFolder") {
        await repo.createFolder({
          id: newId(),
          collectionId,
          parentFolderId: folderId,
          name,
          isStarred: false,
          createdAt: new Date().toISOString(),
        });
      } else if (prompt?.mode === "renameFolder") {
        await repo.updateFolder({ ...prompt.folder, name });
      } else if (prompt?.mode === "createRequest") {
        const request: ApiRequest = {
          id: newId(),
          collectionId,
          folderId,
          name,
          method: "GET",
          url: "",
          params: [],
          headers: [],
          bodyMode: "none",
          bodyRaw: "",
          bodyForm: [],
          auth: { type: "none" },
          createdAt: new Date().toISOString(),
        };
        await repo.createRequest(request);
        setPrompt(null);
        load();
        navigation.navigate("Request", { requestId: request.id });
        return;
      } else if (prompt?.mode === "renameRequest") {
        await repo.updateRequest({ ...prompt.request, name });
      }
      setPrompt(null);
      load();
    } catch (error) {
      notify((error as Error).message);
    }
  };

  const deleteFolder = (folder: Folder) => {
    confirmAction({
      title: "Delete folder?",
      message: `"${folder.name}" and everything in it will be deleted.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await repo.deleteFolder(folder.id);
        load();
        notify("Folder deleted.");
      },
    });
  };

  const deleteRequest = (request: ApiRequest) => {
    confirmAction({
      title: "Delete request?",
      message: `"${request.name}" will be deleted.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await repo.deleteRequest(request.id);
        load();
        notify("Request deleted.");
      },
    });
  };

  const duplicateRequest = async (request: ApiRequest) => {
    await repo.createRequest({
      ...request,
      id: newId(),
      name: `${request.name} copy`,
      createdAt: new Date().toISOString(),
    });
    load();
  };

  const sections: ListSection[] = [
    ...(folders.length > 0
      ? [
          {
            title: "Folders",
            data: folders.map((f): ListItem => ({ type: "folder", folder: f })),
          },
        ]
      : []),
    ...(requests.length > 0
      ? [
          {
            title: "Requests",
            data: requests.map((r): ListItem => ({
              type: "request",
              request: r,
            })),
          },
        ]
      : []),
  ];

  const sheetOptions =
    sheet?.kind === "add"
      ? [
          {
            label: "New request",
            onPress: () => setPrompt({ mode: "createRequest" }),
          },
          {
            label: "New folder",
            onPress: () => setPrompt({ mode: "createFolder" }),
          },
        ]
      : sheet?.kind === "folder"
        ? [
            {
              label: "Rename",
              onPress: () =>
                setPrompt({ mode: "renameFolder", folder: sheet.folder }),
            },
            {
              label: "Delete",
              destructive: true,
              onPress: () => deleteFolder(sheet.folder),
            },
          ]
        : sheet?.kind === "request"
          ? [
              {
                label: "Rename",
                onPress: () =>
                  setPrompt({ mode: "renameRequest", request: sheet.request }),
              },
              {
                label: "Duplicate",
                onPress: () => duplicateRequest(sheet.request),
              },
              {
                label: "Delete",
                destructive: true,
                onPress: () => deleteRequest(sheet.request),
              },
            ]
          : [];

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) =>
          item.type === "folder" ? item.folder.id : item.request.id
        }
        contentContainerStyle={sections.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          <EmptyState
            icon="📄"
            title="Nothing here yet"
            subtitle="Tap + to add a request or a folder."
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) =>
          item.type === "folder" ? (
            <Pressable
              style={styles.row}
              onPress={() =>
                navigation.push("Collection", {
                  collectionId,
                  collectionName,
                  folderId: item.folder.id,
                  folderName: item.folder.name,
                })
              }
              onLongPress={() =>
                setSheet({ kind: "folder", folder: item.folder })
              }
            >
              <Text style={styles.folderIcon}>📂</Text>
              <Text style={[styles.rowTitle, styles.folderTitle]}>
                {item.folder.name}
              </Text>
              <Pressable
                onPress={() =>
                  setSheet({ kind: "folder", folder: item.folder })
                }
                hitSlop={10}
                style={styles.moreButton}
              >
                <Text style={styles.moreText}>⋯</Text>
              </Pressable>
            </Pressable>
          ) : (
            <Pressable
              style={styles.row}
              onPress={() =>
                navigation.navigate("Request", { requestId: item.request.id })
              }
              onLongPress={() =>
                setSheet({ kind: "request", request: item.request })
              }
            >
              <MethodBadge method={item.request.method} />
              <View style={styles.requestBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.request.name}
                </Text>
                {item.request.url !== "" && (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {item.request.url}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() =>
                  setSheet({ kind: "request", request: item.request })
                }
                hitSlop={10}
                style={styles.moreButton}
              >
                <Text style={styles.moreText}>⋯</Text>
              </Pressable>
            </Pressable>
          )
        }
      />
      <ActionSheet
        visible={sheet !== null}
        title={
          sheet?.kind === "add"
            ? "Add to this level"
            : sheet?.kind === "folder"
              ? sheet.folder.name
              : sheet?.kind === "request"
                ? sheet.request.name
                : undefined
        }
        onClose={() => setSheet(null)}
        options={sheetOptions}
      />
      <PromptModal
        visible={prompt !== null}
        title={
          prompt?.mode === "createFolder"
            ? "New folder"
            : prompt?.mode === "renameFolder"
              ? "Rename folder"
              : prompt?.mode === "createRequest"
                ? "New request"
                : "Rename request"
        }
        placeholder={
          prompt?.mode === "createFolder" || prompt?.mode === "renameFolder"
            ? "Folder name"
            : "Request name"
        }
        initialValue={
          prompt?.mode === "renameFolder"
            ? prompt.folder.name
            : prompt?.mode === "renameRequest"
              ? prompt.request.name
              : ""
        }
        submitLabel={
          prompt?.mode === "createFolder" || prompt?.mode === "createRequest"
            ? "Create"
            : "Rename"
        }
        onSubmit={handleSubmit}
        onCancel={() => setPrompt(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  headerAction: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "600",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  folderIcon: {
    fontSize: 16,
    marginRight: spacing.md,
  },
  requestBody: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
  },
  folderTitle: {
    flex: 1,
  },
  rowSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  moreButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  moreText: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: "700",
  },
});
