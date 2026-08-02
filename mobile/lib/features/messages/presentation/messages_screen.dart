import 'package:flutter/material.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';

/// Which conversations the list is showing.
enum MessageFilter { all, travelling, support }

/// Conversations, filtered by pills.
///
/// MOCK. There is no conversation API — zero endpoints — so the list renders
/// empty and the pills filter nothing yet. The structure is real so that
/// wiring a thread repository later is a data change rather than a redesign,
/// but no invented conversations are shown: a fake message from a host is the
/// kind of placeholder that gets screenshotted and mistaken for a feature.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key, this.threads = const <MessageThread>[]});

  final List<MessageThread> threads;

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  MessageFilter _filter = MessageFilter.all;

  List<MessageThread> get _visible => switch (_filter) {
        MessageFilter.all => widget.threads,
        MessageFilter.travelling =>
          widget.threads.where((t) => !t.isSupport).toList(growable: false),
        MessageFilter.support =>
          widget.threads.where((t) => t.isSupport).toList(growable: false),
      };

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);

    final labels = <MessageFilter, String>{
      MessageFilter.all: strings.messagesAll,
      MessageFilter.travelling: strings.messagesTravelling,
      MessageFilter.support: strings.messagesSupport,
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.tabMessages, style: theme.textTheme.headlineSmall),
        toolbarHeight: 72,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsetsDirectional.fromSTEB(
                LcSpacing.screenPadding,
                0,
                LcSpacing.screenPadding,
                12,
              ),
              children: <Widget>[
                for (final filter in MessageFilter.values) ...<Widget>[
                  _FilterPill(
                    label: labels[filter]!,
                    selected: _filter == filter,
                    onTap: () => setState(() => _filter = filter),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
        ),
      ),
      body: _visible.isEmpty
          ? _Empty(strings: strings)
          : ListView.separated(
              padding: const EdgeInsetsDirectional.all(LcSpacing.screenPadding),
              itemCount: _visible.length,
              separatorBuilder: (_, __) => const Divider(height: LcSpacing.sectionGap),
              itemBuilder: (context, i) => _ThreadRow(thread: _visible[i]),
            ),
    );
  }
}

/// A conversation preview.
@immutable
class MessageThread {
  const MessageThread({
    required this.id,
    required this.title,
    required this.preview,
    required this.updatedAt,
    this.isSupport = false,
    this.unread = false,
    this.avatar,
  });

  final String id;
  final String title;
  final String preview;
  final DateTime updatedAt;
  final bool isSupport;
  final bool unread;
  final String? avatar;
}

/// Sand when unselected, ink when selected — the pill pattern from the design
/// package's chip theme, not a bespoke shape.
class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? LcBrand.text : LcBrand.sand,
        borderRadius: LcRadius.pillBorder,
        child: InkWell(
          borderRadius: LcRadius.pillBorder,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: 16,
              vertical: 9,
            ),
            child: Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(
                color: selected ? LcBrand.white : LcBrand.text,
                fontWeight: LcType.label,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.thread});

  final MessageThread thread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final material = MaterialLocalizations.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        CircleAvatar(
          radius: 24,
          backgroundColor: LcBrand.sand,
          foregroundImage:
              thread.avatar == null ? null : NetworkImage(thread.avatar!),
          child: Icon(
            thread.isSupport ? Icons.support_agent : Icons.person_outline,
            color: LcBrand.muted,
          ),
        ),
        const SizedBox(width: LcSpacing.gridGap),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      thread.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight:
                            thread.unread ? LcType.figure : LcType.button,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    material.formatMediumDate(thread.updatedAt),
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: LcBrand.muted),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                thread.preview,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: thread.unread ? LcBrand.text : LcBrand.muted,
                ),
              ),
            ],
          ),
        ),
        if (thread.unread) ...<Widget>[
          const SizedBox(width: 8),
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsetsDirectional.only(top: 6),
            decoration: const BoxDecoration(
              color: LcBrand.coral,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.strings});

  final LcStrings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsetsDirectional.all(LcSpacing.screenPadding * 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.chat_bubble_outline, size: 44, color: LcBrand.sand),
            const SizedBox(height: LcSpacing.gridGap),
            Text(strings.noMessagesYet, style: theme.textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              strings.messagesEmptyBody,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: LcBrand.muted),
            ),
          ],
        ),
      ),
    );
  }
}
