# Masalah penjual — bahan demo

Catatan buat menjawab satu pertanyaan juri: **kenapa penjual peduli?**
Tiap bagian ditulis sebagai *masalah*, bukan sebagai fitur, supaya bisa
dicantumin langsung di demo.

Yang sudah dibuang dari argumen (jangan dipakai):
- ~~"penjual perlu tau sisa saldo biar yakin dibayar"~~ — `draw` jalan sebelum
  `settle` (`daemon/src/fetch.ts:93-104`), duitnya udah ada sebelum penjual
  lihat tanda tangan. Nol risiko.
- ~~"penjual bisa nggak ketagih"~~ — x402 prepaid, cuma scheme `exact`. Nggak
  ada kredit, nggak ada chargeback on-chain. Nggak ada tagihan yang bisa gagal.
- ~~"limit kredit"~~ — nyata di ekonomi asli (LLM API, cloud, compute semuanya
  postpaid), tapi **belum ada di x402**. Ini kasus masa depan. Jangan diklaim
  present-tense.

---

## Masalah 1 — Request yang dibayar tetap bisa bikin penjual rugi

Harga per request ditetapkan terhadap **perilaku rata-rata**. Pembayaran
nggak membatasi perilaku. Yang bikin rugi adalah biaya yang **nggak naik
lurus** sama jumlah request.

**(a) Penjual jual di atas biaya pihak ketiga, dan kuotanya jebol**

| | |
|---|---|
| Harga jual endpoint | $0.010 |
| Kontrak upstream | 1.000.000 lookup / $8.000 → $0.008 per lookup |
| Margin | $0.002 |
| Overage di atas kontrak | $0.05 per lookup |

Satu agent ngabisin 500.000 lookup dalam sehari → kontrak jebol → tiap lookup
sekarang biayanya $0.05 sementara harga jualnya tetap $0.010.
**Rugi $0.04 per request, dan tetap dibayar penuh tiap request.**

**(b) Nilai kumpulan jauh di atas jumlah harga satuan**

100.000 record @ $0.008. Model bisnisnya: banyak pelanggan beli beberapa
ratus record, berulang, bertahun-tahun.

Satu agent bayar **$800** dan ngambil seluruh dataset. Nggak pernah balik, dan
bisa jual ulang. Tiap request untung; agregatnya ngancurin aset.

**(c) Burst lebih mahal daripada volume**

Server disediakan untuk 100 req/s dan dibayar terus-menerus. Agent ngirim
5.000 req/s → server tumbang → **pelanggan lain** kena error → refund → churn.
Pendapatan dari burst-nya: $40.

**Kesimpulan:** harga membatasi *volume yang dibayar*. Rate limit adalah
satu-satunya yang membatasi *perilaku*. Karena itu rate limit tetap ada
walaupun semua request dibayar.

---

## Masalah 2 — Rate limit per-address bocor lewat delegasi

Ini yang paling penting, karena bentuknya **identik** dengan masalah inti
Cordon di sisi uang.

### Cara rate limiter bekerja

Rate limiter itu penghitung yang dikunci ke sesuatu: *"maksimal 100 req/menit
per **X**."* X-nya harus apa?

| Kandidat X | Kenapa gagal di dunia agent |
|---|---|
| IP address | Agent di satu host saling berbagi; agent di host beda nggak kebaca. Nggak ada hubungannya sama pihak. |
| API key | Di x402 agent nggak punya akun. Justru itu intinya. |
| **Address pembayar** | Satu-satunya pilihan natural — tiap pembayaran bawa address pembayar. |

Jadi penjual set: **100 req/menit per address pembayar.** Wajar.

### Di mana bocornya

Di Cordon, **tiap node punya operator key sendiri** (`mandate.operator`, satu
kunci per node). Jadi owner yang spawn 50 agent menghasilkan **50 address
pembayar yang berbeda**.

Penjual lihat 50 pelanggan terpisah. Masing-masing dapat kuota penuh.

```
limit yang diniatkan penjual :   100 req/menit
yang benar-benar didapat owner :  50 × 100 = 5.000 req/menit
```

Dan penjual **nggak bisa mendeteksinya.** 50 address itu EOA biasa yang nggak
punya kaitan apa pun di chain. Nggak ada analisis address yang bisa
menghubungkannya. Bukan karena disembunyikan — memang nggak ada tautannya.

### Kenapa nama menutupnya, dan address nggak bisa

Dari **satu** address pembayar, lewat Resolve:

```
address pembayar
  → reverse resolve → nama  (+ cek balik ke depan, biar nggak bisa diklaim palsu)
  → text record cordon.node → node mandate-nya
  → registry.path(node)     → seluruh leluhur sampai root
```

**Ke-50 address itu jatuh ke root yang sama.** Jadi penjual mengunci
penghitungnya ke **root**, bukan ke address. 100 req/menit berlaku untuk
seluruh keluarga.

### Kalimat yang dipakai di demo

> "Per-address rate limit itu sama persis dengan budget per-agent: dua-duanya
> bocor lewat delegasi. Cordon nutup yang pertama dengan men-debit setiap
> leluhur. Penjual nutup yang kedua dengan mengunci limitnya ke root. **Satu
> insight, dua sisi meja.**"

### Efek samping: blokir juga jadi mungkin

Masalah yang sama, bentuk lain. Kalau penjual mem-blokir satu agent, memblokir
**address**-nya itu sia-sia — owner tinggal spawn agent baru dengan address
baru, dan blokirnya hangus dalam hitungan detik.

Memblokir **root**-nya itu tahan lama.

> **Blokir yang bisa dihindari dengan spawn bukan blokir.**

Jadi satu insight yang sama menutup tiga hal: **budget, rate limit, dan blokir.**
Itu bikin demo lebih rapat, bukan lebih berserak.

---

## Masalah 3 — Agent nggak bisa direfund

### Kapan refund muncul

| Kasus | Kejadiannya |
|---|---|
| Data salah / basi | Agent beli enrichment record $0.05, datanya ngaco |
| Barang nggak nyampe | Agent bayar job (render, scrape, inference), job gagal atau timeout. Prepaid — duitnya udah pergi |
| Kebayar dua kali | Daemon tanda tangan → network timeout → penjual settle juga → daemon retry dengan nonce baru dan bayar lagi. Penjual pegang 2× untuk 1 pengiriman |
| Salah harga | 402 nulis $5.00 padahal maksudnya $0.05 (bug desimal) |

Semuanya normal di commerce. Yang nggak normal: **ke mana refundnya.**

### Kenapa rusak — yang bayar itu kunci, bukan akun

Di commerce biasa lu refund ke kartu atau ke akun. Di sini yang bayar adalah
operator key, dan tiga hal berlaku sekaligus:

1. **Saldonya nol by design.** Vault satu-satunya sumber dana; tiap key agent
   pegang nol. Itu bukan kekurangan, itu inti klaim proyeknya. Jadi "kirim
   balik ke dompet agent" itu ngirim ke tempat yang secara sengaja kosong.
2. **Branch-nya bisa udah dipotong.** Kalau owner udah `revoke`, refund ke
   operator itu duit nyangkut — nggak ada yang bisa pakai lagi.
3. **Kunci itu bisa udah nggak ada.** Child yang di-spawn saat runtime punya
   kunci yang lahir di dalam proses. `keyfile.ts` mendokumentasikan bug ini
   persis: dulu kunci itu mati bareng prosesnya, dan child-nya tinggal live
   di chain tanpa siapa pun yang bisa tanda tangan.

### Dan yang paling nggak intuitif — refund yang "baik hati" itu ngerusak

Kalau penjual **tetap** refund ke balance operator, dia baru saja menyuntikkan
uang yang **nggak diatur bound apa pun.** Uang itu nggak ada di vault, jadi:

- window budget nggak berlaku
- lifetime cap nggak berlaku
- concentration nggak berlaku
- `revoke` nggak menyentuhnya

Agent bisa membelanjakannya **di luar seluruh pagar.**

> **Penjual yang berusaha baik hati malah merusak sistem keselamatan
> pelanggannya sendiri.**

Itu kalimat demo terbaik dari bagian ini, karena berlawanan dengan intuisi dan
memang benar.

### Jawabannya sudah ada di kontrak

```solidity
/// @notice Fund a tree. Anyone may pay in; only the owner may take out.
function fund(bytes32 root, uint128 amount6) external
```

`fund` itu **permissionless**. Penjual refund dengan manggil `fund(root, amount)`
— duitnya balik **ke dalam pagar**, tunduk pada setiap bound lagi, dan cuma
owner yang bisa narik keluar.

Yang dibutuhkan penjual cuma satu: **`root` yang mana.** Itu yang dikasih
Resolve — dia menampilkan rantai leluhur sampai root, plus `revokedAt` yang
bilang masih ada orangnya atau nggak.

### Rangkaian buat demo

> "Agent ini bayar gua $0.05 buat data yang ternyata salah. Gua mau balikin.
> Ke mana? Kunci yang bayar gua saldonya nol by design, mungkin udah dipotong,
> dan mungkin udah nggak ada. Kalau gua paksa kirim ke situ, gua malah naruh
> duit yang nggak dibatasi apa pun ke dalam sistem yang justru dibangun buat
> membatasi. **Gua butuh tau pohonnya, bukan address-nya** — dan `fund` itu
> permissionless, jadi refund gua masuk balik ke dalam pagar."

---

## Ringkasan — apa yang masih berdiri

| Argumen | Status | Kekuatan |
|---|---|---|
| **Akuntabilitas** — "gua komplain ke siapa" | ✅ ada sekarang | Terkuat. Dan nggak ada hubungannya sama uang. |
| **Refund** — ke mana, dan jangan rusak pagarnya | ✅ ada sekarang | Kuat, dan jawabannya udah ada di kontrak (`fund` permissionless) |
| **Rate limit** — per-address bocor lewat delegasi | ✅ ada sekarang | Kuat, dan bentuknya identik sama insight inti proyek |
| **Blokir** — ban yang bisa dihindari dengan spawn | ✅ ada sekarang | Sama insight, tambahan gratis |
| ~~Limit kredit~~ | ⏳ masa depan | x402 prepaid. Jangan diklaim sekarang. |
| ~~Collectability~~ | ❌ salah | Nggak ada tagihan yang bisa gagal. Sudah dibuang. |

## Yang masih belum terjawab — sebut sendiri sebelum ditanya

1. **Nama itu bukan identitas.** `acme.eth` bisa didaftarin anonim seharga lima
   dolar. Nol KYC, nol bukti manusia. Jangan klaim sebaliknya — kalah dalam satu
   kalimat. **Balik pertanyaannya:** penjual nggak butuh identitas, dia butuh
   keterjangkauan dan jalan ganti rugi. Nama ngasih empat hal yang address
   nggak bisa: rantai kustodi (parent-nya harus dipegang seseorang), taruhan
   yang bisa hilang (address gratis dan tak terbatas; nama ada biayanya dan
   riwayatnya menumpuk), pointer yang selamat dari rotasi kunci, dan — yang
   paling tajam — **satu pihak dengan banyak address**, yang cuma pohonnya bisa
   tunjukkan. Penutupnya: *"You don't need to know who I am to hold me
   accountable. You need to know that I persist, that someone above me vouched
   for me, and that I have something to lose."*

2. **Nggak ada yang memaksa penjual ngecek.** Ini masalah adopsi, dan jawabannya
   bukan teknis: nilainya ngalir ke **owner**, bukan ke penjual. Batasan jadi
   **kredensial** — agent lu dilayani justru karena bisa dibuktikan dibatasi.
   Resolve itu barang publik yang bikin klaim owner kredibel, bukan alat yang
   nguntungin penjual.

3. **Layer ENS-nya masih deskriptif, bukan enforcement** (F-10 di
   `AUDIT-INDEPENDENT.md`). Hapus seluruh layer ENS, uangnya tetap aman. Itu tes
   yang dipakai juri ENS. Perbaikannya lebih kecil dari yang sudah dibangun:
   resolver wildcard ENSIP-10 yang menjawab `cordon.live` dan `cordon.headroom`
   dari kontrak saat di-resolve.
