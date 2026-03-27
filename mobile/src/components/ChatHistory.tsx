import React, { useRef, useEffect } from 'react';
import {
  FlatList,
  View,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { ChatMessage } from '../services/apiClient';
import { ChatBubble } from './ChatBubble';
import { Colors } from '../constants/theme';

interface ChatHistoryProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

export function ChatHistory({ messages, isLoading = false }: ChatHistoryProps) {
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 70}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        renderItem={({ item, index }) => (
          <ChatBubble
            message={item}
            isLatest={index === messages.length - 1}
          />
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
      />
    </KeyboardAvoidingView>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.typingContainer}>
      <View style={[styles.avatar]}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotMid]} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingVertical: 12,
    paddingBottom: 16,
  },
  typingContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  avatar: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[200],
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gray[500],
  },
  dotMid: {
    marginHorizontal: 2,
  },
});
