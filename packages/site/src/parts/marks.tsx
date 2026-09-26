/**
 * Sponsor marks, inline.
 *
 * Each one is the official SVG from that project's own brand page, path data
 * unchanged, wrapped so it can be sized and given a title. Inline rather than
 * linked: the strip is above the fold, and a logo that arrives over the
 * network after the text is a logo that shifts the layout under a reader.
 *
 * Only the marks sourced from an official brand page are here. A mark this
 * project cannot source officially is left out and the name carries the item
 * alone — a redrawn or scraped logo is a wrong logo, and a strip that says
 * "built on" is the worst place to put one.
 *
 * ENS asks for a trademark licence before its brand is used, and says not to
 * imply a partnership that does not exist. The owner has confirmed this use
 * is supported; that is recorded here because whoever reads this next should
 * know the requirement exists rather than discover it.
 */

interface MarkProps {
  /** Rendered height. The viewBox does the rest. */
  size?: number;
}

/** ENS, from ens.domains/brand — the preferred symbol, in ENS Blue. */
export function EnsMark({ size = 22 }: MarkProps) {
  return (
    <svg
      viewBox="0 0 202 231"
      height={size}
      role="img"
      aria-label="ENS"
      focusable="false"
      style={{ display: "block", width: "auto" }}
    >
      <path d="M98.3592 2.80337L34.8353 107.327C34.3371 108.147 33.1797 108.238 32.5617 107.505C26.9693 100.864 6.13478 72.615 31.9154 46.8673C55.4403 23.3726 85.4045 6.62129 96.5096 0.831705C97.7695 0.174847 99.0966 1.59007 98.3592 2.80337Z" fill="#0080BC"/> <path d="M94.8459 230.385C96.1137 231.273 97.6758 229.759 96.8261 228.467C82.6374 206.886 35.4713 135.081 28.9559 124.302C22.5295 113.67 9.88976 96.001 8.83534 80.8842C8.7301 79.3751 6.64332 79.0687 6.11838 80.4879C5.27178 82.7767 4.37045 85.5085 3.53042 88.6292C-7.07427 128.023 8.32698 169.826 41.7753 193.238L94.8459 230.386V230.385Z" fill="#0080BC"/> <path d="M103.571 228.526L167.095 124.003C167.593 123.183 168.751 123.092 169.369 123.825C174.961 130.465 195.796 158.715 170.015 184.463C146.49 207.957 116.526 224.709 105.421 230.498C104.161 231.155 102.834 229.74 103.571 228.526Z" fill="#0080BC"/> <path d="M107.154 0.930762C105.886 0.0433954 104.324 1.5567 105.174 2.84902C119.363 24.4301 166.529 96.2354 173.044 107.014C179.471 117.646 192.11 135.315 193.165 150.432C193.27 151.941 195.357 152.247 195.882 150.828C196.728 148.539 197.63 145.808 198.47 142.687C209.074 103.293 193.673 61.4905 160.225 38.078L107.154 0.930762Z" fill="#0080BC"/>
    </svg>
  );
}

/** Ethereum, from ethereum.org — the diamond, in its own greys. */
export function EthereumMark({ size = 22 }: MarkProps) {
  return (
    <svg
      viewBox="0 0 1920 1920"
      height={size}
      role="img"
      aria-label="Ethereum"
      focusable="false"
      style={{ display: "block", width: "auto" }}
    >
      <path d="m959.8 80.7-539.7 895.6 539.7-245.3z" fill="#8a92b2"/><path d="m959.8 731-539.7 245.3 539.7 319.1z" fill="#62688f"/><path d="m1499.6 976.3-539.8-895.6v650.3z" fill="#62688f"/><path d="m959.8 1295.4 539.8-319.1-539.8-245.3z" fill="#454a75"/><path d="m420.1 1078.7 539.7 760.6v-441.7z" fill="#8a92b2"/><path d="m959.8 1397.6v441.7l540.1-760.6z" fill="#62688f"/>
    </svg>
  );
}
