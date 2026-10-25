import { h, defineComponent, type PropType, type VNode } from 'vue'
import * as mfm from 'mfm-js'
import UnicodeEmoji from './UnicodeEmoji.vue'
import MfmEmoji from './MfmEmoji.vue'

/**
 * Renders MFM (Misskey Flavored Markdown). `plain` only handles text + emoji,
 * used for display names.
 */
export default defineComponent({
  name: 'MfmText',
  props: {
    text: { type: String, required: true },
    emojis: { type: Object as PropType<Record<string, string> | undefined>, default: undefined },
    plain: { type: Boolean, default: false },
    /** The author is a cat: render text in cat speech (unless turned off in settings) */
    nyaize: { type: Boolean, default: false },
  },
  setup(props) {
    const account = useCurrentAccount()
    const profile = useProfilePopout()
    const ui = useUi()

    const emojiList = account.value ? useEmojis(account.value) : null

    function emojiUrl(name: string): string | null {
      if (props.emojis?.[name]) return props.emojis[name]
      const local = emojiList?.byName.value.get(name)
      if (local) return local
      const host = account.value?.host
      return host ? `https://${host}/emoji/${name}.webp` : null
    }

    function goTag(e: MouseEvent, tag: string) {
      e.preventDefault()
      const a = account.value
      if (!a) return
      // Guests have no tag channel to open; show it on the server instead
      if (isGuest(a)) window.open(`https://${a.host}/tags/${encodeURIComponent(tag)}`, '_blank', 'noopener,noreferrer')
      else navigateTo(channelPath(a.key, { kind: 'tag', tag }))
    }

    function render(nodes: mfm.MfmNode[]): (VNode | string)[] {
      return nodes.map((node): VNode | string => {
        switch (node.type) {
          case 'text':
            return props.nyaize && ui.catSpeak ? nyaize(node.props.text) : node.props.text
          case 'unicodeEmoji':
            return h(UnicodeEmoji, { emoji: node.props.emoji })
          case 'emojiCode': {
            const url = emojiUrl(node.props.name)
            return url ? h(MfmEmoji, { name: node.props.name, url, animate: !props.plain }) : `:${node.props.name}:`
          }
          case 'bold':
            return h('b', render(node.children))
          case 'italic':
            return h('i', render(node.children))
          case 'strike':
            return h('del', render(node.children))
          case 'small':
            return h('small', { class: 'mfm-small' }, render(node.children))
          case 'center':
            return h('div', { class: 'mfm-center' }, render(node.children))
          case 'plain':
            return h('span', render(node.children))
          case 'inlineCode':
            return h('code', { class: 'mfm-code' }, node.props.code)
          case 'blockCode':
            return h('pre', { class: 'mfm-pre' }, [h('code', node.props.code)])
          case 'mathInline':
            return h('code', { class: 'mfm-code' }, node.props.formula)
          case 'mathBlock':
            return h('pre', { class: 'mfm-pre' }, [h('code', node.props.formula)])
          case 'quote':
            return h('blockquote', { class: 'mfm-quote' }, render(node.children))
          case 'search':
            return h('a', {
              class: 'mfm-search',
              href: `https://www.google.com/search?q=${encodeURIComponent(node.props.query)}`,
              target: '_blank',
              rel: 'noopener noreferrer',
            }, `🔍 ${node.props.query}`)
          case 'url':
            return h('a', { href: safeHttpUrl(node.props.url), target: '_blank', rel: 'noopener noreferrer', class: 'mfm-url' }, node.props.url.replace(/^https?:\/\//, ''))
          case 'link':
            return h('a', { href: safeHttpUrl(node.props.url), target: '_blank', rel: 'noopener noreferrer', title: node.props.url }, render(node.children))
          case 'mention':
            // No profile popout outside the app; link to the profile on the server
            if (account.value && isGuest(account.value)) {
              return h('a', { class: 'mfm-mention', href: `https://${account.value.host}/${node.props.acct}`, target: '_blank', rel: 'noopener noreferrer' }, node.props.acct)
            }
            return h('a', {
              class: 'mfm-mention',
              href: '#',
              onClick: (e: MouseEvent) => {
                e.preventDefault()
                profile.open({ username: node.props.username, host: node.props.host }, e.currentTarget as HTMLElement)
              },
            }, node.props.acct)
          case 'hashtag':
            return h('a', { class: 'mfm-hashtag', href: '#', onClick: (e: MouseEvent) => goTag(e, node.props.hashtag) }, `#${node.props.hashtag}`)
          case 'fn':
            // Animations/transforms are skipped; just show the content
            return h('span', { class: `mfm-fn mfm-fn-${node.props.name}` }, render(node.children))
          default:
            return ''
        }
      })
    }

    const nodes = computed(() => props.plain ? mfm.parseSimple(props.text) : mfm.parse(props.text))
    return () => h('span', { class: 'mfm' }, render(nodes.value))
  },
})
