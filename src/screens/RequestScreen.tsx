import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { notify } from '../lib/dialogs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { repo } from '../data';
import {
  ApiRequest,
  ApiResponse,
  AuthType,
  BodyMode,
  HttpMethod,
} from '../types';
import { formatBytes, prettyBody, sendRequest } from '../lib/http';
import { colors, methodColors, spacing, statusColor } from '../theme';
import KeyValueEditor from '../components/KeyValueEditor';

type Props = NativeStackScreenProps<RootStackParamList, 'Request'>;

const METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

const REQUEST_TABS = ['Params', 'Headers', 'Body', 'Auth'] as const;
type RequestTab = (typeof REQUEST_TABS)[number];

const BODY_MODES: { value: BodyMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'raw', label: 'Raw' },
  { value: 'form', label: 'Form' },
];

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'basic', label: 'Basic' },
];

export default function RequestScreen({ navigation, route }: Props) {
  const { requestId } = route.params;
  const [request, setRequest] = useState<ApiRequest | null>(null);
  const [activeTab, setActiveTab] = useState<RequestTab>('Params');
  const [methodPickerOpen, setMethodPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [responseTab, setResponseTab] = useState<'Body' | 'Headers'>('Body');
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    repo
      .getRequest(requestId)
      .then((loaded) => {
        if (loaded) {
          setRequest(loaded);
        } else {
          notify('Request not found.');
          navigation.goBack();
        }
      })
      .catch((error: Error) => notify(error.message));
  }, [requestId, navigation]);

  const save = useCallback(
    async (current: ApiRequest, silent = false) => {
      try {
        await repo.updateRequest(current);
        if (!silent) {
          notify(`"${current.name}" saved.`);
        }
      } catch (error) {
        notify(`Save failed: ${(error as Error).message}`);
      }
    },
    [],
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: request?.name ?? 'Request',
      headerRight: () =>
        request ? (
          <Pressable onPress={() => save(request)} hitSlop={8}>
            <Text style={styles.headerAction}>Save</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, request, save]);

  const patch = (update: Partial<ApiRequest>) => {
    setRequest((current) => (current ? { ...current, ...update } : current));
  };

  const send = async () => {
    if (!request || request.url.trim() === '') {
      notify('Enter a URL before sending.');
      return;
    }
    setSending(true);
    setSendError(null);
    setResponse(null);
    save(request, true);
    try {
      const result = await sendRequest(request);
      setResponse(result);
      setResponseTab('Body');
    } catch (error) {
      const message = (error as Error).message;
      setSendError(
        message.includes('Abort') ? 'Request timed out after 30s.' : message,
      );
    } finally {
      setSending(false);
    }
  };

  if (!request) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        {/* URL bar */}
        <View style={styles.urlBar}>
          <Pressable
            style={styles.methodButton}
            onPress={() => setMethodPickerOpen((open) => !open)}
          >
            <Text style={[styles.methodText, { color: methodColors[request.method] }]}>
              {request.method}
            </Text>
            <Text style={styles.methodCaret}>▾</Text>
          </Pressable>
          <TextInput
            style={styles.urlInput}
            value={request.url}
            onChangeText={(url) => patch({ url })}
            placeholder="https://api.example.com/users"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        {methodPickerOpen && (
          <View style={styles.methodPicker}>
            {METHODS.map((method) => (
              <Pressable
                key={method}
                style={[
                  styles.methodOption,
                  request.method === method && styles.methodOptionActive,
                ]}
                onPress={() => {
                  patch({ method });
                  setMethodPickerOpen(false);
                }}
              >
                <Text
                  style={[styles.methodOptionText, { color: methodColors[method] }]}
                >
                  {method}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={send}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>

        {/* Request tabs */}
        <View style={styles.tabBar}>
          {REQUEST_TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[styles.tabText, activeTab === tab && styles.tabTextActive]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'Params' && (
            <KeyValueEditor
              items={request.params}
              onChange={(params) => patch({ params })}
              keyPlaceholder="Parameter"
            />
          )}
          {activeTab === 'Headers' && (
            <KeyValueEditor
              items={request.headers}
              onChange={(headers) => patch({ headers })}
              keyPlaceholder="Header"
            />
          )}
          {activeTab === 'Body' && (
            <View>
              <View style={styles.segmented}>
                {BODY_MODES.map((mode) => (
                  <Pressable
                    key={mode.value}
                    style={[
                      styles.segment,
                      request.bodyMode === mode.value && styles.segmentActive,
                    ]}
                    onPress={() => patch({ bodyMode: mode.value })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        request.bodyMode === mode.value && styles.segmentTextActive,
                      ]}
                    >
                      {mode.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {(request.bodyMode === 'json' || request.bodyMode === 'raw') && (
                <TextInput
                  style={styles.bodyInput}
                  value={request.bodyRaw}
                  onChangeText={(bodyRaw) => patch({ bodyRaw })}
                  placeholder={
                    request.bodyMode === 'json' ? '{\n  "key": "value"\n}' : 'Raw body'
                  }
                  placeholderTextColor={colors.textMuted}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
              {request.bodyMode === 'form' && (
                <KeyValueEditor
                  items={request.bodyForm}
                  onChange={(bodyForm) => patch({ bodyForm })}
                  keyPlaceholder="Field"
                />
              )}
              {request.bodyMode === 'none' && (
                <Text style={styles.mutedNote}>This request has no body.</Text>
              )}
            </View>
          )}
          {activeTab === 'Auth' && (
            <View>
              <View style={styles.segmented}>
                {AUTH_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    style={[
                      styles.segment,
                      request.auth.type === type.value && styles.segmentActive,
                    ]}
                    onPress={() => patch({ auth: { ...request.auth, type: type.value } })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        request.auth.type === type.value && styles.segmentTextActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {request.auth.type === 'bearer' && (
                <TextInput
                  style={styles.authInput}
                  value={request.auth.bearerToken ?? ''}
                  onChangeText={(bearerToken) =>
                    patch({ auth: { ...request.auth, bearerToken } })
                  }
                  placeholder="Token"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
              {request.auth.type === 'basic' && (
                <View style={styles.authStack}>
                  <TextInput
                    style={styles.authInput}
                    value={request.auth.basicUsername ?? ''}
                    onChangeText={(basicUsername) =>
                      patch({ auth: { ...request.auth, basicUsername } })
                    }
                    placeholder="Username"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextInput
                    style={styles.authInput}
                    value={request.auth.basicPassword ?? ''}
                    onChangeText={(basicPassword) =>
                      patch({ auth: { ...request.auth, basicPassword } })
                    }
                    placeholder="Password"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </View>
              )}
              {request.auth.type === 'none' && (
                <Text style={styles.mutedNote}>No authorization.</Text>
              )}
            </View>
          )}
        </View>

        {/* Response */}
        {sendError !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{sendError}</Text>
          </View>
        )}
        {response !== null && (
          <View style={styles.responseSection}>
            <View style={styles.responseMeta}>
              <Text style={[styles.responseStatus, { color: statusColor(response.status) }]}>
                {response.status} {response.statusText}
              </Text>
              <Text style={styles.responseMetaText}>{response.durationMs} ms</Text>
              <Text style={styles.responseMetaText}>
                {formatBytes(response.sizeBytes)}
              </Text>
            </View>
            <View style={styles.tabBar}>
              {(['Body', 'Headers'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  style={[styles.tab, responseTab === tab && styles.tabActive]}
                  onPress={() => setResponseTab(tab)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      responseTab === tab && styles.tabTextActive,
                    ]}
                  >
                    {tab}
                  </Text>
                </Pressable>
              ))}
            </View>
            {responseTab === 'Body' ? (
              <ScrollView horizontal style={styles.responseBodyWrap}>
                <Text style={styles.responseBody} selectable>
                  {prettyBody(response.body) || '(empty body)'}
                </Text>
              </ScrollView>
            ) : (
              <View style={styles.responseHeaders}>
                {response.headers.map((header, index) => (
                  <View key={`${header.key}-${index}`} style={styles.responseHeaderRow}>
                    <Text style={styles.responseHeaderKey} selectable>
                      {header.key}
                    </Text>
                    <Text style={styles.responseHeaderValue} selectable>
                      {header.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  headerAction: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  urlBar: {
    flexDirection: 'row',
    margin: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.inputBackground,
  },
  methodText: {
    fontSize: 13,
    fontWeight: '700',
  },
  methodCaret: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 4,
  },
  urlInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  methodPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  methodOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  methodOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  methodOptionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sendButton: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: -1,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  tabContent: {
    padding: spacing.lg,
  },
  segmented: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  segmentText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  bodyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: spacing.md,
    minHeight: 140,
    fontSize: 13,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
  },
  authStack: {
    gap: spacing.sm,
  },
  authInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  mutedNote: {
    color: colors.textMuted,
    fontSize: 13,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: '#FDECEA',
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  responseSection: {
    marginTop: spacing.md,
    borderTopWidth: 8,
    borderTopColor: '#F0F0F0',
    paddingTop: spacing.sm,
  },
  responseMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  responseStatus: {
    fontSize: 14,
    fontWeight: '700',
  },
  responseMetaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  responseBodyWrap: {
    margin: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  responseBody: {
    padding: spacing.md,
    fontSize: 12,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  responseHeaders: {
    margin: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
  },
  responseHeaderRow: {
    marginBottom: spacing.sm,
  },
  responseHeaderKey: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  responseHeaderValue: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  bottomSpacer: {
    height: 48,
  },
});
