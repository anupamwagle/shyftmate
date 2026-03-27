import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '../services/apiClient';
import { Colors, BorderRadius, Spacing, FontSize, Shadow } from '../constants/theme';

interface ChatBubbleProps {
  message: ChatMessage;
  isLatest?: boolean;
}

export function ChatBubble({ message, isLatest = false }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  const bubbleBg = isUser ? Colors.bubble.user : Colors.bubble.assistant;
  const textColor = isUser ? Colors.bubble.userText : Colors.bubble.assistantText;

  const timestamp = formatTime(message.timestamp);

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.containerUser : styles.containerAssistant,
      ]}
    >
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}

      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          { backgroundColor: bubbleBg },
          isLatest && !isUser && Shadow.md,
        ]}
      >
        <Text style={[styles.content, { color: textColor }]}>
          {message.content}
        </Text>
        <Text
          style={[
            styles.timestamp,
            { color: isUser ? 'rgba(255,255,255,0.6)' : Colors.gray[400] },
          ]}
        >
          {timestamp}
        </Text>
      </View>

      {isUser && (
        <View style={[styles.avatar, styles.avatarUser]}>
          <Text style={styles.avatarText}>BA</Text>
        </View>
      )}
    </View>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    alignItems: 'flex-end',
  },
  containerUser: {
    justifyContent: 'flex-end',
  },
  containerAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.xs,
    flexShrink: 0,
  },
  avatarUser: {
    backgroundColor: Colors.brand[200],
  },
  avatarText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.brand[700],
    letterSpacing: 0.5,
  },
  bubble: {
    maxWidth: '72%',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
  },
  bubbleUser: {
    borderBottomRightRadius: BorderRadius.sm,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: BorderRadius.sm,
  },
  content: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
    fontFamily: 'Inter_400Regular',
  },
  timestamp: {
    fontSize: FontSize.xs - 1,
    marginTop: Spacing.xs - 2,
    alignSelf: 'flex-end',
  },
});
