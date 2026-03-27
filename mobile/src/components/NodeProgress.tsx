import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ConversationNode,
  NODE_LABELS,
  NODE_ORDER,
} from '../machines/conversationMachine';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface NodeProgressProps {
  currentNode: ConversationNode;
  compact?: boolean;
}

export function NodeProgress({ currentNode, compact = false }: NodeProgressProps) {
  const currentIndex = NODE_ORDER.indexOf(currentNode);
  const progress = currentIndex >= 0 ? (currentIndex + 1) / NODE_ORDER.length : 0;
  const progressPercent = Math.round(progress * 100);

  if (compact) {
    return <CompactProgress currentNode={currentNode} progressPercent={progressPercent} />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>Interview Progress</Text>
        <Text style={styles.progressText}>{progressPercent}%</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
      </View>

      {/* Node list */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.nodeList}
      >
        {NODE_ORDER.map((node, index) => {
          const isDone = index < currentIndex;
          const isCurrent = node === currentNode;
          return (
            <NodeChip
              key={node}
              node={node}
              isDone={isDone}
              isCurrent={isCurrent}
              index={index + 1}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function CompactProgress({
  currentNode,
  progressPercent,
}: {
  currentNode: ConversationNode;
  progressPercent: number;
}) {
  return (
    <View style={styles.compactContainer}>
      <View style={styles.compactLeft}>
        <MaterialCommunityIcons
          name="clipboard-list-outline"
          size={14}
          color={Colors.brand[600]}
        />
        <Text style={styles.compactLabel} numberOfLines={1}>
          {NODE_LABELS[currentNode]}
        </Text>
      </View>
      <View style={styles.compactBar}>
        <View
          style={[
            styles.compactFill,
            { width: `${progressPercent}%` as any },
          ]}
        />
      </View>
      <Text style={styles.compactPercent}>{progressPercent}%</Text>
    </View>
  );
}

interface NodeChipProps {
  node: ConversationNode;
  isDone: boolean;
  isCurrent: boolean;
  index: number;
}

function NodeChip({ node, isDone, isCurrent, index }: NodeChipProps) {
  return (
    <View
      style={[
        styles.chip,
        isDone && styles.chipDone,
        isCurrent && styles.chipCurrent,
      ]}
    >
      {isDone ? (
        <MaterialCommunityIcons
          name="check-circle"
          size={12}
          color={Colors.brand[600]}
          style={{ marginRight: 3 }}
        />
      ) : (
        <Text
          style={[
            styles.chipIndex,
            isCurrent && styles.chipIndexCurrent,
          ]}
        >
          {index}
        </Text>
      )}
      <Text
        style={[
          styles.chipLabel,
          isDone && styles.chipLabelDone,
          isCurrent && styles.chipLabelCurrent,
        ]}
        numberOfLines={1}
      >
        {NODE_LABELS[node]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressText: {
    fontSize: FontSize.xs,
    color: Colors.brand[600],
    fontFamily: 'Inter_600SemiBold',
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.brand[100],
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.brand[600],
    borderRadius: 2,
  },
  nodeList: {
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    marginRight: Spacing.xs,
  },
  chipDone: {
    backgroundColor: Colors.brand[50],
  },
  chipCurrent: {
    backgroundColor: Colors.brand[600],
  },
  chipIndex: {
    fontSize: FontSize.xs - 1,
    color: Colors.gray[500],
    marginRight: 3,
    fontFamily: 'Inter_500Medium',
  },
  chipIndexCurrent: {
    color: Colors.white,
  },
  chipLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray[600],
    fontFamily: 'Inter_400Regular',
  },
  chipLabelDone: {
    color: Colors.brand[700],
  },
  chipLabelCurrent: {
    color: Colors.white,
    fontFamily: 'Inter_600SemiBold',
  },

  // Compact
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.brand[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.brand[100],
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 100,
  },
  compactLabel: {
    fontSize: FontSize.xs,
    color: Colors.brand[700],
    fontFamily: 'Inter_500Medium',
  },
  compactBar: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.brand[100],
    borderRadius: 2,
  },
  compactFill: {
    height: '100%',
    backgroundColor: Colors.brand[600],
    borderRadius: 2,
  },
  compactPercent: {
    fontSize: FontSize.xs,
    color: Colors.brand[600],
    fontFamily: 'Inter_600SemiBold',
    minWidth: 28,
    textAlign: 'right',
  },
});
