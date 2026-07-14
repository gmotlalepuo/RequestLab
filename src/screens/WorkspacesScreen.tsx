import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { repo, storageMode } from '../data';
import { Workspace } from '../types';
import { newId } from '../lib/id';
import { confirmAction, notify } from '../lib/dialogs';
import { colors, spacing } from '../theme';
import PromptModal from '../components/PromptModal';
import ActionSheet from '../components/ActionSheet';
import EmptyState from '../components/EmptyState';

type Props = NativeStackScreenProps<RootStackParamList, 'Workspaces'>;

export default function WorkspacesScreen({ navigation }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; workspace: Workspace } | null
  >(null);
  const [actionsFor, setActionsFor] = useState<Workspace | null>(null);

  const load = useCallback(() => {
    repo
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((error: Error) => notify(error.message));
  }, []);

  useFocusEffect(load);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setPrompt({ mode: 'create' })} hitSlop={8}>
          <Text style={styles.headerAction}>＋</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const handleSubmit = async (name: string) => {
    try {
      if (prompt?.mode === 'rename') {
        await repo.updateWorkspace({ ...prompt.workspace, name });
      } else {
        await repo.createWorkspace({
          id: newId(),
          name,
          createdAt: new Date().toISOString(),
        });
      }
      setPrompt(null);
      load();
    } catch (error) {
      notify((error as Error).message);
    }
  };

  const deleteWorkspace = (workspace: Workspace) => {
    confirmAction({
      title: 'Delete workspace?',
      message: `"${workspace.name}" and all its collections will be deleted.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await repo.deleteWorkspace(workspace.id);
        load();
        notify('Workspace deleted.');
      },
    });
  };

  return (
    <View style={styles.container}>
      {storageMode === 'local' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Storing data on this device. Add Supabase credentials in .env to sync.
          </Text>
        </View>
      )}
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        contentContainerStyle={workspaces.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          <EmptyState
            icon="🗂️"
            title="No workspaces yet"
            subtitle="Tap + to create your first workspace. Workspaces hold your collections."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate('Workspace', {
                workspaceId: item.id,
                workspaceName: item.name,
              })
            }
            onLongPress={() => setActionsFor(item)}
          >
            <View style={styles.rowIcon}>
              <Text style={styles.rowIconText}>🗂️</Text>
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
        visible={actionsFor !== null}
        title={actionsFor?.name}
        onClose={() => setActionsFor(null)}
        options={
          actionsFor
            ? [
                {
                  label: 'Rename',
                  onPress: () => setPrompt({ mode: 'rename', workspace: actionsFor }),
                },
                {
                  label: 'Delete',
                  destructive: true,
                  onPress: () => deleteWorkspace(actionsFor),
                },
              ]
            : []
        }
      />
      <PromptModal
        visible={prompt !== null}
        title={prompt?.mode === 'rename' ? 'Rename workspace' : 'New workspace'}
        placeholder="Workspace name"
        initialValue={prompt?.mode === 'rename' ? prompt.workspace.name : ''}
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
  banner: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    color: colors.primaryDark,
    fontSize: 12,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  headerAction: {
    color: colors.primary,
    fontSize: 22,
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
