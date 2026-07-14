import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { RootStackParamList } from '../navigation';
import { repo } from '../data';
import { Collection } from '../types';
import { newId } from '../lib/id';
import { confirmAction, notify } from '../lib/dialogs';
import {
  exportPostmanCollection,
  importPostmanCollection,
} from '../lib/postman';
import { colors, spacing } from '../theme';
import PromptModal from '../components/PromptModal';
import ActionSheet from '../components/ActionSheet';
import EmptyState from '../components/EmptyState';

type Props = NativeStackScreenProps<RootStackParamList, 'Workspace'>;

const safeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'collection';

const downloadOnWeb = (json: string, fileName: string): void => {
  const doc = (globalThis as unknown as { document: Document }).document;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const shareOnNative = async (json: string, fileName: string, title: string) => {
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true, intermediates: true });
  file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: title,
    });
  } else {
    notify(`Exported to ${file.uri}`);
  }
};

export default function WorkspaceScreen({ navigation, route }: Props) {
  const { workspaceId, workspaceName } = route.params;
  const [collections, setCollections] = useState<Collection[]>([]);
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; collection: Collection } | null
  >(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<Collection | null>(null);

  const load = useCallback(() => {
    repo
      .listCollections(workspaceId)
      .then(setCollections)
      .catch((error: Error) => notify(error.message));
  }, [workspaceId]);

  useFocusEffect(load);

  const importFromJson = useCallback(
    async (json: string) => {
      const { collection, folders, requests } = importPostmanCollection(
        json,
        workspaceId,
      );
      await repo.createCollection(collection);
      for (const folder of folders) {
        await repo.createFolder(folder);
      }
      for (const request of requests) {
        await repo.createRequest(request);
      }
      load();
      notify(
        `Imported "${collection.name}" (${requests.length} request${requests.length === 1 ? '' : 's'}).`,
      );
    },
    [workspaceId, load],
  );

  const importFromFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      const asset = result.assets[0];
      let json: string;
      if (Platform.OS === 'web') {
        json = asset.file
          ? await asset.file.text()
          : await (await fetch(asset.uri)).text();
      } else {
        const { File } = await import('expo-file-system');
        json = await new File(asset.uri).text();
      }
      await importFromJson(json);
    } catch (error) {
      notify(`Import failed: ${(error as Error).message}`);
    }
  }, [importFromJson]);

  const importFromClipboard = useCallback(async () => {
    try {
      const json = await Clipboard.getStringAsync();
      if (!json) {
        notify('Clipboard is empty.');
        return;
      }
      await importFromJson(json);
    } catch (error) {
      notify(`Import failed: ${(error as Error).message}`);
    }
  }, [importFromJson]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: workspaceName,
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable onPress={() => setImportSheetOpen(true)} hitSlop={8}>
            <Text style={styles.headerActionSecondary}>Import</Text>
          </Pressable>
          <Pressable onPress={() => setPrompt({ mode: 'create' })} hitSlop={8}>
            <Text style={styles.headerAction}>＋</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, workspaceName]);

  const handleSubmit = async (name: string) => {
    try {
      if (prompt?.mode === 'rename') {
        await repo.updateCollection({ ...prompt.collection, name });
      } else {
        await repo.createCollection({
          id: newId(),
          workspaceId,
          name,
          description: '',
          createdAt: new Date().toISOString(),
        });
      }
      setPrompt(null);
      load();
    } catch (error) {
      notify((error as Error).message);
    }
  };

  const exportCollection = async (
    collection: Collection,
    destination: 'file' | 'clipboard',
  ) => {
    try {
      const [folders, requests] = await Promise.all([
        repo.listFolders(collection.id),
        repo.listRequests(collection.id),
      ]);
      const json = exportPostmanCollection(collection, folders, requests);
      if (destination === 'clipboard') {
        await Clipboard.setStringAsync(json);
        notify('Collection JSON copied to clipboard.');
        return;
      }
      const fileName = `${safeFileName(collection.name)}.postman_collection.json`;
      if (Platform.OS === 'web') {
        downloadOnWeb(json, fileName);
        notify('Download started.');
      } else {
        await shareOnNative(json, fileName, `Export ${collection.name}`);
      }
    } catch (error) {
      notify(`Export failed: ${(error as Error).message}`);
    }
  };

  const deleteCollection = (collection: Collection) => {
    confirmAction({
      title: 'Delete collection?',
      message: `"${collection.name}" and everything in it will be deleted.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await repo.deleteCollection(collection.id);
        load();
        notify('Collection deleted.');
      },
    });
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={collections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={collections.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          <EmptyState
            icon="📁"
            title="No collections yet"
            subtitle="Tap + to create a collection, or Import a Postman collection JSON."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate('Collection', {
                collectionId: item.id,
                collectionName: item.name,
                folderId: null,
              })
            }
            onLongPress={() => setActionsFor(item)}
          >
            <View style={styles.rowIcon}>
              <Text style={styles.rowIconText}>📁</Text>
            </View>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Pressable
              onPress={() => setActionsFor(item)}
              hitSlop={10}
              style={styles.moreButton}
            >
              <Text style={styles.moreText}>⋯</Text>
            </Pressable>
          </Pressable>
        )}
      />
      <ActionSheet
        visible={importSheetOpen}
        title="Import Postman Collection (v2.x JSON)"
        onClose={() => setImportSheetOpen(false)}
        options={[
          { label: 'From file', onPress: importFromFile },
          { label: 'From clipboard', onPress: importFromClipboard },
        ]}
      />
      <ActionSheet
        visible={actionsFor !== null}
        title={actionsFor?.name}
        onClose={() => setActionsFor(null)}
        options={
          actionsFor
            ? [
                {
                  label: 'Rename',
                  onPress: () => setPrompt({ mode: 'rename', collection: actionsFor }),
                },
                {
                  label: Platform.OS === 'web' ? 'Export (download file)' : 'Export (share file)',
                  onPress: () => exportCollection(actionsFor, 'file'),
                },
                {
                  label: 'Export (copy JSON)',
                  onPress: () => exportCollection(actionsFor, 'clipboard'),
                },
                {
                  label: 'Delete',
                  destructive: true,
                  onPress: () => deleteCollection(actionsFor),
                },
              ]
            : []
        }
      />
      <PromptModal
        visible={prompt !== null}
        title={prompt?.mode === 'rename' ? 'Rename collection' : 'New collection'}
        placeholder="Collection name"
        initialValue={prompt?.mode === 'rename' ? prompt.collection.name : ''}
        submitLabel={prompt?.mode === 'rename' ? 'Rename' : 'Create'}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  headerAction: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '600',
  },
  headerActionSecondary: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowIconText: {
    fontSize: 16,
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  moreButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  moreText: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '700',
  },
});
