import type { UserLite } from '~/types/misskey'

const KO_NA = /[나-낳]/g
const KO_DA = /(다$)|(다(?=\.))|(다(?= ))|(다(?=!))|(다(?=\?))/gm
const KO_YA = /(야(?=\?))|(야$)|(야(?= ))/gm
const KO_NYA_OFFSET = '냐'.charCodeAt(0) - '나'.charCodeAt(0)

/** Misskey's cat speech (な→にゃ, 나→냐, 다→다냥…), ported from misskey-js so text matches the web UI. */
export function nyaize(text: string): string {
  return text
    // ja-JP
    .replaceAll('な', 'にゃ').replaceAll('ナ', 'ニャ').replaceAll('ﾅ', 'ﾆｬ')
    // en-US
    .replace(/(?<=n)a/gi, x => x === 'A' ? 'YA' : 'ya')
    .replace(/(?<=morn)ing/gi, x => x === 'ING' ? 'YAN' : 'yan')
    .replace(/(?<=every)one/gi, x => x === 'ONE' ? 'NYAN' : 'nyan')
    // ko-KR
    .replace(KO_NA, m => String.fromCharCode(m.charCodeAt(0) + KO_NYA_OFFSET))
    .replace(KO_DA, '다냥')
    .replace(KO_YA, '냥')
}

/** Cat accounts talk like cats unless a fork's `speakAsCat` turned it off. */
export function speaksAsCat(user: UserLite) {
  return !!user.isCat && user.speakAsCat !== false
}
