/**
 * The filter primitives every Cordon surface points at. Mounted once per
 * document by `CordonProvider`; duplicating it is harmless but wasteful.
 */
export function CordonDefs() {
  return (
    <svg className="cordon-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id="cordonGrain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".54"
            numOctaves="3"
            seed="27"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.8" intercept="-.25" />
            <feFuncG type="linear" slope="1.8" intercept="-.25" />
            <feFuncB type="linear" slope="1.8" intercept="-.25" />
            <feFuncA type="table" tableValues="0 .52" />
          </feComponentTransfer>
        </filter>

        <filter id="cordonPaper" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".8"
            numOctaves="4"
            seed="8"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 .18" />
          </feComponentTransfer>
        </filter>

        <filter id="cordonSoft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.35" />
        </filter>

        <filter id="cordonHalo" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5.2" />
        </filter>

        <filter id="cordonBloom" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>
    </svg>
  );
}
