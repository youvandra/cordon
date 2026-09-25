# Cordon — Independent Audit

Posisi: juri/auditor eksternal. Bukan baca README, bukan baca roadmap.
Yang dinilai: kode yang ada, dan apa yang terjadi kalau kode itu dijalankan.

Tanggal audit: 25 Sep 2026. Commit: `a53e862`. Branch: `claude/sleepy-ride-ln2l80`.

---

## 0. Apa yang benar-benar aku jalankan

Bukan klaim dari file `*.gen.ts`. Ini hasil run di mesin audit:

| Suite | Hasil |
|---|---|
| `packages/contracts` (forge) | **103 pass, 0 fail** — termasuk fuzz 512 runs & 3 invariant × 256 runs × 8192 calls |
| `packages/contracts` G1 saja | **69 pass** |
| `packages/daemon` | 74 pass, 0 fail |
| `packages/attest` | 40 pass, 0 fail — *tapi lihat F-3* |
| `packages/meter` | 39 pass, 0 fail |
| `packages/proxy` | 18 pass, 0 fail |
| `packages/eval` | 10 pass, 0 fail |
| `packages/fixtures` | 3 pass, 0 fail |

**Tidak bisa diverifikasi:** deployment Sepolia (`11155111.json`). Network policy
di sandbox audit ini nge-block semua RPC host yang aku coba. Jadi alamat kontrak
di `deployments/` aku perlakukan sebagai *unverified by me* — bukan sebagai salah.

---

## 1. Penilaian jujur dulu, sebelum kritik

Ini bukan hackathon project biasa, dan aku nggak mau kritiknya kedengeran seperti
proyek ini lemah. Yang kuat, kuat beneran:

- **`refusal returns, never reverts`** — dan refusal tidak memakan budget. Dua
  properti ini load-bearing, dan dua-duanya ada tesnya. Banyak tim bikin
  `require()` lalu kehilangan event-nya. Ini nggak.
- **Ancestor debit** (`TreeVault._commit`) — satu draw men-debit setiap leluhur
  sampai root. Ini satu-satunya hal yang nggak bisa dilakukan per-agent wallet
  atau per-session limit, dan invariant suite-nya membuktikan tidak ada urutan
  draw apa pun yang melewati budget root.
- **Tidak ada admin key, tidak ada proxy, tidak ada pause, deployer tidak
  disimpan.** Immutable beneran, bukan "immutable setelah timelock".
- **`lifetimeCap6`** menutup lubang "window budget itu cuma rate". Alasan
  `windowSeconds` harus *sama* dengan parent (bukan cuma lebih kecil) juga
  benar dan subtle — child window yang lebih pendek mengubah budget parent
  jadi rate.
- **`headroom()` balikin bound terketat di seluruh path *plus* node
  pengikatnya.** Ini primitive UI yang 90% proyek salah: nunjukin $30 milik
  cucu padahal root udah penuh.
- **ENS-nya ENSv2 asli**, bukan `getEnsAddress` doang: ETHRegistrar
  commit/reveal, UserRegistry proxy via VerifiableFactory, PermissionedResolver,
  EAC role mirroring, ENSIP-25 + ENSIP-26, reverse resolution dengan
  forward re-check. `agentId` dibaca dari chain, bukan dikirim sebagai argumen
  — itu detail yang cuma muncul kalau orangnya mikir soal cosmetic attestation.
- Dua "trap" di `script/ens/README.md` (cast me-resolve argumen `.eth`, dan
  dua deployment ENSv2 di Sepolia) itu field knowledge asli. Nggak ada di docs
  mana pun.
- **Egress fence** cek *semua* address hasil resolve, handle `::ffff:127.0.0.1`,
  follow redirect sendiri. Jujur soal TOCTOU yang masih kebuka.
- `formatUsdc` yang nggak pernah nampilin amount non-zero sebagai `$0.00` —
  itu bug nyata yang ketemu dan dibenerin ke arah yang benar (truncate, bukan
  round up).

Kalau aku juri ENS, ini masuk **top decile** dari semua ENS integration yang
aku lihat di hackathon. Tapi belum menang. Alasannya di §4.

---

## 2. Temuan — yang aku buktikan dengan test

### F-1 · `release()` membayar operator dari branch yang sudah di-revoke
**Severity: High (semantic).** `TreeVault.release()` tidak pernah memanggil
`registry.revokedAt()`.

Dibuktikan:
```
revoke(childA)
→ draw(grandchild, seller, $0.20) = refused, reason = Revoked   ✓
→ release(refusalId)
→ gateway balance operator grandchild NAIK $0.20                ✗
```
Halaman depan bilang *"Revoking stops the money"*. `release` adalah satu-satunya
jalan yang mengabaikannya. Ya, butuh signature owner — jadi ini bukan privilege
escalation. Tapi owner yang me-release refusal ber-reason `Revoked` sedang
mendanai branch yang dia sendiri bunuh, dan nggak ada satu baris pun yang
memberitahu dia.

**Fix (1 baris):**
```solidity
if (registry.revokedAt(r.node) != bytes32(0)) revert BranchIsCut(refusalId);
```
Kalau justru disengaja (owner boleh bayar tagihan terakhir dari branch mati),
maka itu harus ada di docstring `release` dan di halaman Names. Sekarang nggak
ada di dua-duanya.

### F-2 · `release()` invisible di semua view pengeluaran → console under-report
**Severity: High (integrity).** Ini yang paling merusak, karena tesis proyeknya
adalah *"the record is the product"*.

Dibuktikan:
```
lifetimeCap6          $10.00
lifetimeSpent (view)  $10.00
yang benar-benar keluar dari vault  $10.40
windowSpent (view)    $10.00
```
Keputusan desain "released amount tidak memakan window budget" itu **benar** dan
terdokumentasi — `headroom` harus tetap begitu. Yang salah: **tidak ada view
on-chain mana pun yang menjumlahkan apa yang benar-benar terkirim.** Dan console
membaca `lifetimeSpent` sebagai angka headline:
- `packages/console/src/screens/Overview.tsx:166`
- `packages/console/src/screens/Agents.tsx:229`
- `packages/console/src/parts/NodeDetail.tsx:98`

Jadi dashboard owner under-report tepat sebesar total release. Menariknya
`packages/meter/src/ledger.ts` **benar** — dia hitung `released6` dan bahkan
`releasedUnattributed6`. Jadi indexer-nya jujur, layar owner-nya nggak.

**Fix:** mapping terpisah, bukan digabung ke `_lifetimeSpent` (kalau digabung,
`headroom`'s `lifetimeCap6 - _lifetimeSpent` bisa underflow):
```solidity
mapping(bytes32 => uint128) private _releasedSpent;   // di release()
function releasedSpent(bytes32 node) external view returns (uint128);
```
Lalu console tampilkan `delivered = lifetimeSpent + releasedSpent`, dengan
release-nya dipisah visual. Itu justru memperkuat argumen: "sistem ini menghitung
override, bukan cuma breach" jadi benar di layar, bukan cuma di komentar.

### F-3 · Suite `attest` merah di run pertama setelah clone bersih
**Severity: High (judging risk).** Run pertama aku: **29 tests, 1 fail**. Run
ke-2/3/4: 40/40 hijau.

Akar masalah: `packages/attest/test/collect.test.ts:60`
```ts
before(async () => {
  execFileSync("forge", ["build"], { cwd: contracts, stdio: "pipe" });
  ...
}, { timeout: 120_000 });
```
`forge build` penuh (+ download solc di mesin bersih) di dalam hook ber-timeout
120 detik. Juri yang clone lalu `npm test` dapat merah di percobaan pertama,
hijau di kedua. Itu kesan pertama yang paling mahal di seluruh repo ini.

**Fix:** pindahkan build ke `pretest` / script root, jangan di dalam timeout
test. Dan kalau tetap di situ, naikkan timeout + print progress.

### F-4 · Tidak ada CI. Sama sekali.
**Severity: High.** Nggak ada `.github/` di repo ini.

Untuk proyek yang seluruh kredibilitasnya berdiri di atas "gate G1–G7 hijau",
tidak ada satu pun mesin yang memverifikasi itu. Dan efeknya sudah kelihatan
— lihat F-5.

### F-5 · Angka gate sudah drift
`packages/fixtures/src/gates.gen.ts` bilang `G1: tests 66, recordedAt 2026-09-11`.
Hitungan hari ini: **G1 = 69 tests.** Arahnya under-claim (bagus, jujur), tapi
buktinya jelas: pipeline "recorded, never typed" — yang merupakan integrity story
proyek ini — **sudah tidak dijalankan lagi**, dan tanpa CI nggak ada yang
menjalankannya.

### F-6 · Tidak ada root `package.json` → tidak ada satu perintah untuk run
**Severity: Medium (judging risk).** 9 lockfile terpisah, 9 `npm ci`, 9 `npm test`,
tanpa workspace. Juri punya 4 menit per proyek. Ini bukan detail kosmetik.

### F-7 · Default chain masih Arc di 3 dari 4 tempat
**Severity: High (demo-breaking).** `packages/fixtures/src/index.ts` sendiri
mendokumentasikan bug ini dan bilang sudah dibenerin dengan `chainFacts()`.
Yang dibenerin cuma `meter`:

| File | Status |
|---|---|
| `packages/meter/src/main.ts:150` | ✅ pakai `chainFacts(args.chainId)` |
| `packages/daemon/src/gate.ts:96` | ❌ `nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }` |
| `packages/attest/src/main.ts:76` | ❌ `decimals: ARC.nativeDecimals` |
| `packages/attest/src/demo-main.ts:33` | ❌ sama |

Lebih parah, `packages/daemon/src/config.ts:115-125`:
```
rpcUrl   ?? ARC.rpc
chainId  ?? ARC.chainId        (5042002)
usdc     ?? ARC.erc20
networks ?? `eip155:${ARC.chainId}`
assets   ?? ARC.erc20
pollMs   ?? 250
```
Konsekuensi nyata: juri yang `npx cordon-mcp` dengan env minimal mendarat di
**Arc**, di mana tidak ada satu pun nama ENS. Kalau dia set `CORDON_RPC` ke
Sepolia tapi lupa `CORDON_CHAIN_ID`, dia dapat chainId Arc di atas RPC Sepolia,
dan `networks: eip155:5042002` bikin settlement x402 nolak seller Sepolia.

Dan `pollMs: 250` di Sepolia adalah persis footgun rate-limit yang
`meter/src/main.ts` tulis panjang-panjang sebagai alasan dia *tidak* pakai 250.

Satu lagi: `DEPLOYMENT` (singular) di `deployment.gen.ts` masih nunjuk Arc,
padahal `DEPLOYMENTS[11155111]` adalah deploy hari ini.

### F-8 · Biaya gas belum pernah dihadapi
**Severity: High (thesis risk).** Aku ukur di shape tree demo sendiri, harga
`STRUCTURING_UNIT6` = $0.008:

| Operasi | Gas |
|---|---|
| draw depth 0 (cold) | 206,087 |
| draw depth 1 (cold) | 179,478 |
| draw depth 2 (cold) | **198,481** |
| draw depth 2 (warm) | 93,112 |
| **refusal** depth 2 | **128,839** |
| `evaluate` (view) | 30,884 |
| `headroom` (view) | 26,779 |

198k gas untuk mem-bound pembelian $0.008. Di mainnet @20 gwei / ETH $3,000 itu
**~$12 untuk mengizinkan transaksi $0.008** — 1,500× nilai yang dijaga. Dan
refusal juga bayar gas (129k), karena daemon memang sengaja broadcast draw yang
sudah dia tahu akan refuse (`gate.ts` drawInTurn — dan itu keputusan yang
*benar*: "a draw that is never recorded is a draw nobody can hold the tree to").

Ini bukan bug. Ini pertanyaan pertama yang akan ditanya juri manapun yang pernah
deploy ke mainnet, dan repo ini belum punya jawabannya di mana pun. Arc dan
Sepolia dua-duanya gas-nya gratis, jadi masalahnya tidak pernah muncul.

Aku juga coba fix yang paling obvious — `_evaluate` sudah membaca mandate setiap
leluhur, `_commit` membacanya **lagi**. Aku patch supaya array-nya diteruskan:
hasilnya cuma **−3% di depth 1, −9% di depth 255**. Jadi cost driver-nya bukan
external call, tapi **3 cold SSTORE per leluhur per draw** (node window,
lifetime, counterparty window). Fix-nya struktural, bukan micro-opt.

### F-9 · `maxDepth` tanpa plafon → 14M gas per draw
`open()` menerima `maxDepth = 255`. Diukur:

| depth | gas per draw |
|---|---|
| 1 | 255,171 |
| 16 | 1,365,521 |
| 64 | 4,484,186 |
| 128 | 6,889,152 |
| 255 | **14,000,356** |

Self-harm, bukan attack (nggak ada yang bisa memaksa leluhur orang lain jadi
dalam). Tapi ini footgun konfigurasi yang bikin tree mati secara ekonomi, dan
plafonnya satu baris: `if (p.maxDepth > MAX_TREE_DEPTH) revert`.

### F-10 · ENS dan mandate cuma disatukan oleh konvensi
**Severity: High — dan ini yang paling penting buat track ENS.** Detail di §4.

Ringkas: seluruh state ENS ditulis oleh forge script one-shot yang baca
`.env.ens`. Tidak ada kontrak yang menjaga sinkronisasi. Akibatnya:

1. `MirrorAuthority.s.sol` memberi operator `ROLE_REGISTRAR` di subregistry-nya.
   `registry.revoke(node)` **tidak** mencabut role itu. Operator dari branch
   mati masih bisa mint subname.
2. `CutBranch.s.sol` meng-`unregister` **tepat satu** tokenId. Revoke subtree
   = N transaksi manual, satu per descendant, diingat manusia. Yang kelewat
   tetap resolve, nunjuk `cordon.node` yang sudah mati.
3. Semua record (`cordon.node`, `agent-endpoint[mcp]`, `agent-context`) adalah
   text statis. Drift adalah default-nya, bukan edge case.

Repo-nya tahu ini dan jawabannya *"read the contract, not the record"* — itu
guidance yang benar, **dan sekaligus pengakuan bahwa layer ENS-nya dekoratif
untuk keselamatan.** Itu persis yang bikin juri ENS nggak kasih hadiah.

### F-11 · `ENSV2.universalResolver` dideklarasikan, tidak pernah dipakai
`packages/fixtures/src/index.ts:191`. Satu-satunya kemunculan di seluruh repo.
`resolveName.ts` pakai universal resolver bawaan viem untuk chain `sepolia`.
Entah field-nya dead code, atau resolution-nya lewat resolver yang salah —
dua-duanya perlu dijawab, dan cuma bisa dijawab dengan RPC (yang aku nggak punya
di sandbox ini).

### F-12 · `cordon_fetch` = HTTP client umum
`method` + `body` arbitrer ke host publik mana pun. Klaim "agent nggak bisa
mengekspresikan *kirim uang ke X*" **tetap valid** untuk USDC Cordon. Tapi agent
tetap bisa POST apa pun yang dia tahu ke endpoint publik mana pun — itu kanal
exfiltration yang independen dari fence uang. `egress.ts` sendiri sudah jujur
soal TOCTOU DNS rebinding yang masih terbuka.

**Fix:** (a) pin koneksi ke address yang sudah dicek — undici `Agent` dengan
`lookup` custom; (b) batasi `cordon_fetch` ke GET + body yang berasal dari
challenge 402, atau minimal log setiap body non-GET ke record.

### F-13 · Komentar dan kode nggak sepakat soal kustodi kunci
`packages/daemon/src/gate.ts:149` (`addOperator`): *"The key stays in this
process's memory: it is never returned to a caller, never logged, and **never
written to disk**."*

`packages/daemon/src/server.ts:160-165`:
```ts
const operator = deps.gate.addOperator(secret);
const label = deps.keyFile?.remember(secret, operator, purpose);   // → ~/.cordon/cordon.env
```
`keyfile.ts` **benar** dan alasannya bagus (0600, tulis sebelum spawn, kalau
nggak child-nya jadi live-tapi-tak-bertuan). Yang salah cuma komentarnya. Di
repo yang komentarnya adalah artefak utama, satu komentar yang overstate garansi
kustodi kunci itu temuan, bukan typo.

### F-14 · Nol integrasi World
`worldcoin`, `World ID`, `IDKit`, `MiniKit`, `nullifier` — nol hit di seluruh
repo. Untuk track WORLD, skor hari ini **0**. Detail di §5 — dan menurutku ini
peluang terbesar yang belum diambil, bukan sekadar checkbox.

### F-15 · Kecil-kecil
- `AI_USAGE.md` bertanggal "26 September 2026" — besok. Di repo yang setiap
  angka diberi tanggal verifikasi, tanggal masa depan itu retakan kecil.
- Heading di `site/src/sections/Names.tsx`: **"Cutting the name cuts the branch"**
  — body-nya benar ("revoking stops the money, unregistering stops the
  discovery"), heading-nya overstate. Juri baca heading.
- `DRILL_RUN` tercatat 9 request / $0.007 dari plafon $0.020. Sementara
  `STRUCTURING_CALLS = 2000` dipakai sebagai narasi. `fixtures` jujur bahwa
  DRILL_RUN adalah yang benar-benar dijalankan — tapi angka 2000 dan angka 9
  jangan pernah muncul di layar yang sama tanpa penjelasan.

---

## 3. Skor, kalau aku juri

| Dimensi | Skor | Kenapa |
|---|---|---|
| Kualitas kontrak & reasoning | **9 / 10** | Ancestor debit + invariant + immutability. Ini level audit-ready, bukan level hackathon. |
| Kedalaman integrasi ENS | **8.5 / 10** | ENSv2 asli, EAC, ENSIP-25/26, reverse. Tertinggal karena dekoratif & manual. |
| Integrasi World | **0 / 10** | Tidak ada. |
| Reliability demo | **5 / 10** | Default nunjuk chain yang salah, test merah di run pertama, no CI. |
| Ekonomi / kesiapan mainnet | **4 / 10** | 198k gas per $0.008, belum pernah dibahas. |
| Kejujuran klaim | **9 / 10** | Jarang banget. Repo ini menulis batasannya sendiri. Pengurangnya: F-1, F-2, F-13. |
| Craft narasi & UI | **9 / 10** | `headroom` + `boundBy`, `formatUsdc`, comment-as-documentation. |

**Verdict:** kalau juri cuma baca kode → finalis kuat. Kalau juri *menjalankan*
demo dari instruksi default → jatuh di F-7, sebelum lihat apa pun. Itu jarak
antara proyek bagus dan proyek yang menang, dan jaraknya cuma beberapa jam kerja.

---

## 4. Kalau aku juri ENS: satu hal yang mengubah keputusanku

Sekarang ENS di Cordon adalah **papan nama**. Aku bisa hapus seluruh layer ENS
dan sistem uangnya tetap jalan identik. Itu tes yang dipakai juri ENS, dan
Cordon belum lulus.

### Bikin ENS jadi jalur enforcement, bukan deskripsi: `CordonResolver`

Satu kontrak. Resolver ENSIP-10 wildcard yang **menjawab dari kontrak saat
di-resolve**, bukan dari text yang ditulis script:

```solidity
contract CordonResolver {
    MandateRegistry immutable registry;
    TreeVault immutable vault;

    // ENSIP-10: satu resolver melayani seluruh subtree
    function resolve(bytes calldata name, bytes calldata data)
        external view returns (bytes memory);

    // text(node, key) dijawab live:
    //   cordon.live      → "true" | "revoked:0x…"   ← revokedAt(), saat itu juga
    //   cordon.headroom  → "4.230000"               ← headroom(), saat itu juga
    //   cordon.boundBy   → "0x…"                    ← node pengikatnya
    //   cordon.node      → dari mapping namehash→node, sekali di-spawn
}
```

Yang langsung hilang begitu ini ada:

1. **F-10 lenyap secara struktural.** Branch yang di-revoke otomatis menjawab
   `revoked` di ENS. Nggak ada transaksi kedua, nggak ada `unregister` manual,
   nggak ada drift — karena nggak ada salinan.
2. **Spawn jadi nol transaksi ENS.** Wildcard berarti `worker7.probe.acme.eth`
   resolve tanpa pernah di-register. Sekarang setiap agent butuh
   `deployProxy` + `setResolver` + 6 `setText`. Itu perbedaan antara demo dan
   sistem yang bisa spawn 50 agent.
3. **Text lookup ENS biasa jadi authorization check.** Seller nggak butuh SDK
   Cordon, nggak butuh tahu Cordon ada. `ens.getText(name, "cordon.headroom")`
   — itu sudah ada di setiap library ENS di setiap bahasa. **Itu** distribusi.
4. **"Kenapa ENS dan bukan database?"** jadi punya jawaban yang nggak bisa
   dibantah: karena nama itulah yang *dibaca*, dan yang membacanya tidak perlu
   izin dari siapa pun.

Tambahan yang melengkapinya:

- **ERC-3668 / CCIP-Read** supaya nama di **mainnet** bisa resolve terhadap
  mandate di Sepolia/L2. Ini jawaban jujur untuk masalah yang repo ini tulis
  sendiri (*"a name on one chain cannot cut a mandate on another without a
  bridge or an off-chain control"*) — CCIP-Read bukan bridge dan bukan off-chain
  control; dia gateway read-only yang jawabannya diverifikasi on-chain. Itu
  persis bentuk yang dicari.
- **`@cordon/verify` di npm** — satu fungsi, `verify(address) → { name, live,
  headroom, boundBy }`, plus middleware x402. Kodenya **sudah ada** di
  `console/src/lib/resolveName.ts`; sekarang dia React hook, jadi nggak
  bisa dipakai seller mana pun. Memindahkannya ~100 baris kerja dan mengubah
  proyek dari demo jadi dependency.
- **Rotasi kunci lewat ENS (opt-in).** Sekarang `mandate.operator` immutable
  dan registry nggak punya cara repoint — itu justru *alasan* kunci harus
  ditulis ke disk (F-13). Kalau mandate bisa menyimpan namehash sebagai
  alternatif address, `draw` bisa otorisasi
  `msg.sender == resolver.addr(operatorNamehash)`, dan rotasi kunci jadi update
  ENS record, bukan bunuh-branch-lalu-spawn-ulang. Trade-off-nya nyata: itu
  menaruh kontrol resolver di jalur uang. Jadi buat per-mandate flag, default
  tetap address. Menyebut trade-off itu di demo lebih meyakinkan daripada
  fiturnya sendiri.

Kalau `CordonResolver` ada dan aku bisa `dig`/`getText` sebuah nama dan lihat
headroom-nya turun live sementara agent-nya belanja, lalu lihat nama itu
menjawab `revoked` 12 detik setelah owner klik cut — **itu** yang menang track
ENS. Yang ada sekarang menunjukkan bahwa penulisnya *mampu* membangun itu.

---

## 5. Kalau aku juri WORLD: hari ini nol, tapi bentuknya sudah ada

Aku nggak akan nyaranin nempel World ID biar dapat track. Tapi di kodebase ini
ada **dua tempat yang bentuknya persis World-shaped**, dan dua-duanya tulang
punggung argumen proyek:

**1. `MandateRegistry.open()` — satu manusia, satu akar.**

Repo ini **mengutip** masalah Sybil sebagai alasan keberadaannya:
`REGISTRY_BASELINE` (arxiv 2606.26028) — 90.6% agent ERC-8004 ter-flag Sybil,
biaya membalik status $0.0027. Cordon menyelesaikan separuh **budget**-nya.
Separuh **identitas**-nya nggak tersentuh: siapa pun bisa `open()` seribu root
dari seribu key.

World ID menutupnya persis: `open()` menerima proof, `nullifierHash` jadi
identitas pemilik tree. Satu manusia terverifikasi, satu akar. Tiba-tiba
"agent ini dibatasi" naik jadi **"agent ini dibatasi, dan di belakangnya ada
satu manusia yang tidak bisa jadi seribu"** — dan itu tepat statistik yang
sudah dikutip di halaman depan proyek ini.

**2. `TreeVault.release()` — fungsi paling World-shaped di seluruh repo.**

Docstring-nya sudah bilang: *"the decision is a person's, and it has their
signature on it."* Sekarang "person" = sebuah address. Tambahkan proof World ID
di calldata `release`, dan kalimat itu berubah jadi *"a verified unique human
signed this exception"* — itu klaim yang jauh lebih kuat, biayanya satu argumen,
dan **tidak menambah satu pun kekuasaan off-chain** (yang penting, karena
seluruh proyek ini menolak punya kontrol off-chain).

**3. Console sebagai World App mini app.** Owner approve/refuse release dari HP.
Console-nya sudah jadi; mini app itu wrapper. Dan ini menjawab pertanyaan
praktis yang belum dijawab: refusal terjadi jam 3 pagi — owner-nya di mana?

Urutannya penting: **(2) dulu, baru (1).** `release` itu satu fungsi, satu
signature, dampak naratifnya besar. Gating `open()` menyentuh setiap test dan
setiap script deploy.

---

## 6. Rekomendasi, terurut — apa yang aku kerjakan kalau ini punyaku

**Sebelum submit (jam, bukan hari):**

| # | Kerjaan | Kenapa sekarang |
|---|---|---|
| 1 | **F-7** — `chainFacts()` di `daemon/gate.ts`, `attest/main.ts`, `attest/demo-main.ts`; default ke Sepolia; `pollMs` per-chain; `DEPLOYMENT` → Sepolia | Ini yang menjatuhkan demo di depan juri. Paling murah, paling fatal. |
| 2 | **F-3** — `forge build` keluar dari hook test | Kesan pertama. Merah di run pertama. |
| 3 | **F-6 + F-4** — root `package.json` + workspaces, satu `npm test`; GitHub Action yang jalanin forge + semua suite node **dan** regenerate `gates.gen.ts` | Menyelesaikan F-5 selamanya, dan integrity story-nya jadi benar-benar otomatis |
| 4 | **F-1** — tolak release pada refusal ber-reason `Revoked` | 1 baris, menutup kontradiksi dengan klaim utama |
| 5 | **F-2** — `_releasedSpent` + view + console `delivered` | 1 baris klaim jadi benar di layar owner |
| 6 | **F-15** — tanggal AI_USAGE, heading "Cutting the name" | Menit-menit |

**Yang mengubah hasil penilaian (hari, bukan jam):**

| # | Kerjaan | Track |
|---|---|---|
| 7 | **`CordonResolver`** — ENSIP-10 wildcard, jawab `cordon.live` / `cordon.headroom` / `cordon.boundBy` dari kontrak saat resolve | **ENS — ini yang menang** |
| 8 | **`@cordon/verify`** di npm + middleware x402 | ENS + distribusi |
| 9 | **World ID di `release()`**, lalu di `open()` dengan nullifier sebagai identitas tree | **WORLD — dari 0** |
| 10 | **F-8/F-9** — plafon `maxDepth`, publish tabel gas, dan nyatakan jawaban L2-nya secara eksplisit | Kredibilitas di hadapan juri yang pernah deploy mainnet |
| 11 | ERC-3668 / CCIP-Read supaya nama mainnet resolve ke mandate L2 | ENS, kelas atas |
| 12 | **F-12** — pin koneksi (undici `lookup`), batasi `method`/`body` | Keamanan |

---

## 7. Satu paragraf, kalau cuma ini yang dibaca

Cordon menyelesaikan masalah yang nyata (delegasi agent tanpa batas agregat)
dengan mekanisme yang benar (ancestor debit, refusal sebagai return, mandate
immutable, nol admin key), dan membuktikannya dengan 103 test kontrak termasuk
invariant yang tidak vakum. ENS-nya ENSv2 asli dan lebih dalam dari hampir
semua yang aku lihat. Tiga hal menahannya: **(a)** layer ENS-nya dekoratif —
hapus dia, uangnya tetap aman, dan itu tes yang dipakai juri ENS; **(b)** demo
default-nya nunjuk chain yang salah, dan run pertama test-nya merah, jadi juri
bisa jatuh sebelum melihat apa pun; **(c)** biaya 198k gas untuk membatasi
pembelian $0.008 belum pernah dihadapi di mana pun di repo ini. (a) diperbaiki
oleh satu kontrak resolver wildcard yang *lebih kecil* dari script ENS yang
sudah dibangun. (b) diperbaiki dalam satu jam. (c) diperbaiki dengan menyebutnya
lebih dulu daripada juri — lengkap dengan tabelnya.

---

*Audit ini dijalankan, bukan dibaca: 103 test kontrak, 184 test TypeScript, dan
enam probe adversarial yang aku tulis sendiri. Probe-nya ada di scratchpad
sesi ini (`ZZ_Audit.t.sol`, `ZZ_Gas.t.sol`) dan tidak di-commit — bilang kalau
mau dimasukin ke `test/` sebagai regression guard untuk F-1 dan F-2.*
