// BestJavPorn - XPTV csp 格式 (csp_bestjavporn)
// 转换自 mira-cat nodejs/src/spider/video/bestjavporn.js (py_bestjavporn, 2026-10-22 现行版)。
// 站点: https://www.bestjavporn.com (WordPress/RetroTube JAV 聚合站, 全站公开免费)。
// 依赖: 自有 pornfhd-fetch Worker (https://pornfhd-fetch.li768435813.workers.dev) 的
//   /get 取页通道、/post 铸造通道与铸造库只读查库 (GET /cast?u=<watch页URL>);
//   本模块只查库, 绝不写库 (无任何 PUT 逻辑)。
// 降级/待验项:
//   - $fetch.post 待真机验 (仓内两源均无 POST 先例): 铸造库未命中时经 Worker /post
//     或 $fetch.post 直连 POST /api/play/ 现铸, 请求线格式逐字沿用猫版。
//   - XPTV 契约无嗅探位: 铸造全灭时 getPlayinfo 降级回 watch 页 URL 本身,
//     待真机验 XPTV 是否嗅探非媒体 URL。
//   - 猫版多通道竞速与定时重试 (own 三发间隔) 一律改串行, 无 setTimeout 参与逻辑;
//     诊断卡/诊断集名丢弃, 集名保持干净; 字幕聚合未移植 (getPlayinfo 契约无 subs 位)。
//   - 线路结果带 180 秒内存缓存 (仅加速, 未命中即整链重算, 不依赖跨调用传状态)。
const HOST = 'https://www.bestjavporn.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = HOST + '/';
const OWN_FETCH = 'https://pornfhd-fetch.li768435813.workers.dev';

// 分类表: 逐字沿用猫版 CATS (精选分类/片商/标签共 477 个, type_id 为站方规范路径含 /v{n}/ 前缀)。
const CATS = [
{
"type_id": "/v42/category/censored/",
"type_name": "Censored"
},
{
"type_id": "/v12/category/uncensored/",
"type_name": "Uncensored"
},
{
"type_id": "/v25/category/decensored/",
"type_name": "Decensored"
},
{
"type_id": "/v25/category/amateur/",
"type_name": "Amateur"
},
{
"type_id": "/v10/category/censored/english-subtitle/",
"type_name": "English Subtitle"
},
{
"type_id": "/v14/category/chinese-subtitle/",
"type_name": "Chinese Subtitle"
},
{
"type_id": "/v2/category/subtitle-indonesia/",
"type_name": "Subtitle Indonesia"
},
{
"type_id": "/v11/category/uncensored/fc2-ppv/",
"type_name": "FC2 PPV"
},
{
"type_id": "/v39/category/uncensored/1pondo/",
"type_name": "1Pondo"
},
{
"type_id": "/v28/category/uncensored/caribbeancom/",
"type_name": "Caribbeancom"
},
{
"type_id": "/v50/category/uncensored/10musume/",
"type_name": "10Musume"
},
{
"type_id": "/v54/category/uncensored/heyzo/",
"type_name": "Heyzo"
},
{
"type_id": "/v59/category/uncensored/pacopacomama/",
"type_name": "Pacopacomama"
},
{
"type_id": "/v1/category/uncensored/tokyo-hot/",
"type_name": "Tokyo Hot"
},
{
"type_id": "/category/hitozuma/",
"type_name": "Hitozuma"
},
{
"type_id": "/category/subthai/",
"type_name": "SubThai"
},
{
"type_id": "/v25/category/decensored/uncensored-leaked/",
"type_name": "Uncensored Leaked"
},
{
"type_id": "/studio/moodyz/",
"type_name": "MOODYZ"
},
{
"type_id": "/v3/studio/madonna/",
"type_name": "MADONNA"
},
{
"type_id": "/v56/studio/fc2/",
"type_name": "FC2"
},
{
"type_id": "/studio/prestige/",
"type_name": "Prestige"
},
{
"type_id": "/v4/studio/s1-no-1-style/",
"type_name": "S1 NO.1 Style"
},
{
"type_id": "/v32/studio/sod-create/",
"type_name": "SOD Create"
},
{
"type_id": "/studio/idea-pocket/",
"type_name": "Idea Pocket"
},
{
"type_id": "/v1/studio/attackers/",
"type_name": "Attackers"
},
{
"type_id": "/studio/venus/",
"type_name": "VENUS"
},
{
"type_id": "/studio/glory-quest/",
"type_name": "Glory Quest"
},
{
"type_id": "/studio/wanz-factory/",
"type_name": "Wanz Factory"
},
{
"type_id": "/studio/k-m-produce/",
"type_name": "K M Produce"
},
{
"type_id": "/v1/studio/center-village/",
"type_name": "Center Village"
},
{
"type_id": "/studio/h-m-p/",
"type_name": "h.m.p"
},
{
"type_id": "/studio/hunter/",
"type_name": "Hunter"
},
{
"type_id": "/v1/studio/fitch/",
"type_name": "Fitch"
},
{
"type_id": "/v4/studio/kawaii/",
"type_name": "kawaii"
},
{
"type_id": "/v3/studio/premium/",
"type_name": "PREMIUM"
},
{
"type_id": "/studio/faleno/",
"type_name": "Faleno"
},
{
"type_id": "/studio/planet-plus/",
"type_name": "Planet Plus"
},
{
"type_id": "/studio/alice-japan/",
"type_name": "Alice JAPAN"
},
{
"type_id": "/studio/tameike-goro/",
"type_name": "Tameike Goro"
},
{
"type_id": "/v1/studio/das/",
"type_name": "Das"
},
{
"type_id": "/studio/oppai/",
"type_name": "OPPAI"
},
{
"type_id": "/studio/star-paradise/",
"type_name": "STAR PARADISE"
},
{
"type_id": "/studio/takara-eizo/",
"type_name": "Takara Eizo"
},
{
"type_id": "/v3/studio/natural-high/",
"type_name": "Natural High"
},
{
"type_id": "/v1/studio/ruby/",
"type_name": "Ruby"
},
{
"type_id": "/v1/studio/e-body/",
"type_name": "E-BODY"
},
{
"type_id": "/studio/maxing/",
"type_name": "MAXING"
},
{
"type_id": "/studio/crystal-eizo/",
"type_name": "Crystal Eizo"
},
{
"type_id": "/studio/shiroutotv/",
"type_name": "シロウトTV"
},
{
"type_id": "/studio/big-morkal/",
"type_name": "Big Morkal"
},
{
"type_id": "/studio/hon-naka/",
"type_name": "Hon Naka"
},
{
"type_id": "/studio/max-a/",
"type_name": "Max A"
},
{
"type_id": "/studio/waap-entertainment/",
"type_name": "Waap Entertainment"
},
{
"type_id": "/v1/studio/nagae-style/",
"type_name": "Nagae Style"
},
{
"type_id": "/studio/takara-eizou/",
"type_name": "Takara Eizou"
},
{
"type_id": "/studio/media-station/",
"type_name": "Media Station"
},
{
"type_id": "/v25/studio/hot-entertainment/",
"type_name": "Hot Entertainment"
},
{
"type_id": "/v6/studio/doc/",
"type_name": "DOC"
},
{
"type_id": "/studio/puresutezipuremiamu-prestige-premium/",
"type_name": "プレステージプレミアム(PRESTIGE PREMIUM)"
},
{
"type_id": "/studio/next-group/",
"type_name": "NEXT GROUP"
},
{
"type_id": "/v15/studio/rocket/",
"type_name": "ROCKET"
},
{
"type_id": "/studio/dogma/",
"type_name": "Dogma"
},
{
"type_id": "/studio/first-star/",
"type_name": "First Star"
},
{
"type_id": "/studio/hibino/",
"type_name": "Hibino"
},
{
"type_id": "/v2/studio/real-works/",
"type_name": "Real Works"
},
{
"type_id": "/studio/an-nosu-ren/",
"type_name": "俺の素人"
},
{
"type_id": "/studio/office-k-s/",
"type_name": "OFFICE K'S"
},
{
"type_id": "/studio/raguziyutv/",
"type_name": "ラグジュTV"
},
{
"type_id": "/studio/skyu-shiroto/",
"type_name": "Skyu Shiroto"
},
{
"type_id": "/studio/ienergy/",
"type_name": "Ienergy"
},
{
"type_id": "/v1/studio/tma/",
"type_name": "TMA"
},
{
"type_id": "/studio/aurora-project-annex/",
"type_name": "Aurora Project ANNEX"
},
{
"type_id": "/studio/celeb-no-tomo/",
"type_name": "Celeb no Tomo"
},
{
"type_id": "/studio/honnaka/",
"type_name": "Honnaka"
},
{
"type_id": "/studio/nadeshiko/",
"type_name": "Nadeshiko"
},
{
"type_id": "/studio/muku/",
"type_name": "Muku"
},
{
"type_id": "/studio/dream-ticket/",
"type_name": "Dream Ticket"
},
{
"type_id": "/v1/studio/sodkurieito/",
"type_name": "SODクリエイト"
},
{
"type_id": "/studio/momotaro-eizo/",
"type_name": "Momotaro Eizo"
},
{
"type_id": "/v1/studio/nanpatv/",
"type_name": "ナンパTV"
},
{
"type_id": "/v28/studio/caribbeancom/",
"type_name": "Caribbeancom"
},
{
"type_id": "/v1/studio/giga/",
"type_name": "GIGA"
},
{
"type_id": "/v1/studio/deep-s/",
"type_name": "Deep's"
},
{
"type_id": "/studio/akinori/",
"type_name": "Akinori"
},
{
"type_id": "/studio/deeps/",
"type_name": "Deeps"
},
{
"type_id": "/v6/studio/switch/",
"type_name": "SWITCH"
},
{
"type_id": "/studio/an-nosu-ren-z/",
"type_name": "俺の素人-Z-"
},
{
"type_id": "/v1/studio/kira-kira/",
"type_name": "kira*kira"
},
{
"type_id": "/studio/fa-pro/",
"type_name": "FA Pro"
},
{
"type_id": "/studio/m-s-video-group/",
"type_name": "M's Video Group"
},
{
"type_id": "/studio/avs-collector-s/",
"type_name": "AVS collector's"
},
{
"type_id": "/studio/lahaina-tokai/",
"type_name": "Lahaina Tokai"
},
{
"type_id": "/v1/studio/dahlia/",
"type_name": "DAHLIA"
},
{
"type_id": "/studio/serebu-no-tomo/",
"type_name": "Serebu No Tomo"
},
{
"type_id": "/studio/s-cute/",
"type_name": "S-Cute"
},
{
"type_id": "/v4/studio/sadistic-village/",
"type_name": "Sadistic Village"
},
{
"type_id": "/v55/studio/heyzo/",
"type_name": "HEYZO"
},
{
"type_id": "/v1/studio/tokyo-hot/",
"type_name": "Tokyo-Hot"
},
{
"type_id": "/v1/studio/global-media-entertainment/",
"type_name": "Global Media Entertainment"
},
{
"type_id": "/studio/momotarou-eizou-shuppan/",
"type_name": "Momotarou Eizou Shuppan"
},
{
"type_id": "/studio/crystal-eizou/",
"type_name": "Crystal Eizou"
},
{
"type_id": "/studio/rebecca/",
"type_name": "REbecca"
},
{
"type_id": "/studio/chijo-heaven/",
"type_name": "Chijo Heaven"
},
{
"type_id": "/v10/studio/dandy/",
"type_name": "DANDY"
},
{
"type_id": "/studio/befree/",
"type_name": "BeFree"
},
{
"type_id": "/studio/mercury-mercury/",
"type_name": "MERCURY (Mercury)"
},
{
"type_id": "/studio/plum/",
"type_name": "Plum"
},
{
"type_id": "/studio/digital-ark/",
"type_name": "Digital Ark"
},
{
"type_id": "/v1/studio/scoop/",
"type_name": "Scoop"
},
{
"type_id": "/studio/glay-z/",
"type_name": "Glay'z"
},
{
"type_id": "/studio/abc-mousouzoku/",
"type_name": "ABC / Mousouzoku"
},
{
"type_id": "/studio/janesu/",
"type_name": "Janesu"
},
{
"type_id": "/v50/studio/10musume/",
"type_name": "10Musume"
},
{
"type_id": "/v2/studio/cinemagic/",
"type_name": "Cinemagic"
},
{
"type_id": "/studio/v-r-produce/",
"type_name": "V&R PRODUCE"
},
{
"type_id": "/studio/avs/",
"type_name": "Avs"
},
{
"type_id": "/studio/non/",
"type_name": "NON"
},
{
"type_id": "/studio/aroma-planning/",
"type_name": "Aroma Planning"
},
{
"type_id": "/studio/ei-ten/",
"type_name": "Ei Ten"
},
{
"type_id": "/studio/yama-to-sora/",
"type_name": "Yama to Sora"
},
{
"type_id": "/studio/abc-mousou-zoku/",
"type_name": "Abc/ Mousou Zoku"
},
{
"type_id": "/studio/karuma/",
"type_name": "Karuma"
},
{
"type_id": "/studio/red/",
"type_name": "Red"
},
{
"type_id": "/studio/kanbi/",
"type_name": "KANBi"
},
{
"type_id": "/studio/leo/",
"type_name": "LEO"
},
{
"type_id": "/studio/babyentertainment/",
"type_name": "BabyEntertainment"
},
{
"type_id": "/studio/radix/",
"type_name": "Radix"
},
{
"type_id": "/studio/u-k/",
"type_name": "U & K"
},
{
"type_id": "/v24/studio/gogos/",
"type_name": "Gogos"
},
{
"type_id": "/studio/marx/",
"type_name": "MARX"
},
{
"type_id": "/studio/atena-eizou/",
"type_name": "Atena Eizou"
},
{
"type_id": "/studio/hei-chuan/",
"type_name": "黒船"
},
{
"type_id": "/v59/studio/pacopacomama/",
"type_name": "Pacopacomama"
},
{
"type_id": "/studio/huresutesihuremiamu-prestige-premium/",
"type_name": "プレステージプレミアム(PRESTIGE PREMIUM)"
},
{
"type_id": "/studio/royal/",
"type_name": "Royal"
},
{
"type_id": "/studio/su-ren-hoihoi/",
"type_name": "素人ホイホイ"
},
{
"type_id": "/studio/siroutotv/",
"type_name": "シロウトTV"
},
{
"type_id": "/studio/alpha-international/",
"type_name": "Alpha International"
},
{
"type_id": "/studio/mr-michiru/",
"type_name": "Mr. Michiru"
},
{
"type_id": "/studio/i-b-works/",
"type_name": "I.B.WORKS"
},
{
"type_id": "/studio/ie-nergy/",
"type_name": "IE NERGY"
},
{
"type_id": "/studio/rookie/",
"type_name": "ROOKIE"
},
{
"type_id": "/studio/mirai-future/",
"type_name": "Mirai Future"
},
{
"type_id": "/studio/kuki/",
"type_name": "KUKI"
},
{
"type_id": "/studio/janes/",
"type_name": "Janes"
},
{
"type_id": "/studio/paradise-tv/",
"type_name": "Paradise TV"
},
{
"type_id": "/studio/nanhatv/",
"type_name": "ナンパTV"
},
{
"type_id": "/studio/marrion/",
"type_name": "MARRION"
},
{
"type_id": "/v2/studio/lunatics/",
"type_name": "LUNATICS"
},
{
"type_id": "/studio/hajime-kikaku/",
"type_name": "Hajime Kikaku"
},
{
"type_id": "/v7/studio/go-go-zu/",
"type_name": "Go-go-zu"
},
{
"type_id": "/studio/apache/",
"type_name": "Apache"
},
{
"type_id": "/studio/bigmorkal/",
"type_name": "BIGMORKAL"
},
{
"type_id": "/studio/sex-agent/",
"type_name": "SEX Agent"
},
{
"type_id": "/v29/studio/bullitt/",
"type_name": "Bullitt"
},
{
"type_id": "/v1/studio/nanpa-japan/",
"type_name": "Nanpa JAPAN"
},
{
"type_id": "/studio/bibian/",
"type_name": "bibian"
},
{
"type_id": "/studio/puresutezi/",
"type_name": "プレステージ"
},
{
"type_id": "/studio/jet-eizou/",
"type_name": "JET Eizou"
},
{
"type_id": "/studio/jet-eizo/",
"type_name": "JET Eizo"
},
{
"type_id": "/studio/hentai-shinshi-club/",
"type_name": "Hentai Shinshi Club"
},
{
"type_id": "/studio/shiroutomanman/",
"type_name": "しろうとまんまん"
},
{
"type_id": "/studio/media-bank/",
"type_name": "Media Bank"
},
{
"type_id": "/studio/audaz-japan/",
"type_name": "Audaz Japan"
},
{
"type_id": "/v1/studio/k-tribe/",
"type_name": "K-tribe"
},
{
"type_id": "/studio/spice-visual/",
"type_name": "Spice Visual"
},
{
"type_id": "/studio/bi/",
"type_name": "Bi"
},
{
"type_id": "/studio/nampa-japan/",
"type_name": "Nampa JAPAN"
},
{
"type_id": "/studio/mbm/",
"type_name": "MBM"
},
{
"type_id": "/studio/puramu/",
"type_name": "プラム"
},
{
"type_id": "/studio/pakopakodan-to-yukaina-nakamatachi/",
"type_name": "Pakopakodan to Yukaina Nakamatachi"
},
{
"type_id": "/studio/h0930/",
"type_name": "H0930"
},
{
"type_id": "/studio/unfinished/",
"type_name": "Unfinished"
},
{
"type_id": "/v1/studio/c0930/",
"type_name": "C0930"
},
{
"type_id": "/studio/hayabusa/",
"type_name": "Hayabusa"
},
{
"type_id": "/studio/baltan/",
"type_name": "Baltan"
},
{
"type_id": "/studio/dream-stage/",
"type_name": "Dream Stage"
},
{
"type_id": "/studio/s-kyuu-shirouto/",
"type_name": "S Kyuu Shirouto"
},
{
"type_id": "/studio/reddo/",
"type_name": "Reddo"
},
{
"type_id": "/studio/teppan/",
"type_name": "TEPPAN"
},
{
"type_id": "/studio/huresutesi/",
"type_name": "プレステージ"
},
{
"type_id": "/studio/toyohiko/",
"type_name": "Toyohiko"
},
{
"type_id": "/studio/ksb-kikaku-emmanuelle/",
"type_name": "KSB Kikaku/Emmanuelle"
},
{
"type_id": "/studio/fa-pro-platinum/",
"type_name": "FA Pro . Platinum"
},
{
"type_id": "/studio/sekimenjoshi/",
"type_name": "Sekimenjoshi"
},
{
"type_id": "/studio/wu-waihu/",
"type_name": "舞ワイフ"
},
{
"type_id": "/studio/vip/",
"type_name": "VIP"
},
{
"type_id": "/v11/studio/gos/",
"type_name": "GOS"
},
{
"type_id": "/studio/barutan/",
"type_name": "Barutan"
},
{
"type_id": "/studio/maza/",
"type_name": "Maza"
},
{
"type_id": "/studio/shy-kikaku/",
"type_name": "Shy Kikaku"
},
{
"type_id": "/studio/mellow-moon/",
"type_name": "Mellow Moon"
},
{
"type_id": "/studio/ara/",
"type_name": "ARA"
},
{
"type_id": "/studio/jukujo-japan/",
"type_name": "Jukujo JAPAN"
},
{
"type_id": "/studio/glayz/",
"type_name": "GLAYz"
},
{
"type_id": "/studio/golden-time/",
"type_name": "Golden Time"
},
{
"type_id": "/studio/daddy-s-private-photos/",
"type_name": "Daddy's Private Photos"
},
{
"type_id": "/v19/studio/peters/",
"type_name": "Peters"
},
{
"type_id": "/studio/mercury/",
"type_name": "MERCURY"
},
{
"type_id": "/studio/su-ren-clover/",
"type_name": "素人CLOVER"
},
{
"type_id": "/studio/insuta/",
"type_name": "いんすた"
},
{
"type_id": "/studio/milk/",
"type_name": "MILK"
},
{
"type_id": "/studio/jump/",
"type_name": "JUMP"
},
{
"type_id": "/v5/studio/next/",
"type_name": "NEXT"
},
{
"type_id": "/studio/onetime/",
"type_name": "ONETIME"
},
{
"type_id": "/studio/ke-toraibu/",
"type_name": "Ke- . Toraibu"
},
{
"type_id": "/studio/fetish-box-mousouzoku/",
"type_name": "Fetish Box / Mousouzoku"
},
{
"type_id": "/studio/afro-film/",
"type_name": "AFRO-FILM"
},
{
"type_id": "/studio/h4610/",
"type_name": "H4610"
},
{
"type_id": "/studio/geneisha/",
"type_name": "Geneisha"
},
{
"type_id": "/studio/aroma-kikaku/",
"type_name": "Aroma Kikaku"
},
{
"type_id": "/studio/kaguya-hime-pt-mousozoku/",
"type_name": "Kaguya Hime Pt / Mousozoku"
},
{
"type_id": "/v23/tag/creampie/",
"type_name": "Creampie"
},
{
"type_id": "/v13/tag/affair/",
"type_name": "Affair"
},
{
"type_id": "/v25/tag/amateur/",
"type_name": "Amateur"
},
{
"type_id": "/v6/tag/cuckold/",
"type_name": "Cuckold"
},
{
"type_id": "/v3/tag/female-college-student/",
"type_name": "Female College Student"
},
{
"type_id": "/v1/tag/first-creampie/",
"type_name": "First Creampie"
},
{
"type_id": "/v1/tag/gal/",
"type_name": "Gal"
},
{
"type_id": "/v4/tag/gonzo/",
"type_name": "Gonzo"
},
{
"type_id": "/v29/tag/married-woman/",
"type_name": "Married Woman"
},
{
"type_id": "/v1/tag/individual-shooting/",
"type_name": "Individual Shooting"
},
{
"type_id": "/v4/tag/masturbation/",
"type_name": "Masturbation"
},
{
"type_id": "/v2/tag/model/",
"type_name": "Model"
},
{
"type_id": "/v13/tag/nampa/",
"type_name": "Nampa"
},
{
"type_id": "/v3/tag/nurse/",
"type_name": "Nurse"
},
{
"type_id": "/v5/tag/ol/",
"type_name": "Ol"
},
{
"type_id": "/v9/tag/ntr/",
"type_name": "Ntr"
},
{
"type_id": "/v4/tag/original/",
"type_name": "Original"
},
{
"type_id": "/v1/tag/slender/",
"type_name": "Slender"
},
{
"type_id": "/v5/tag/squirting/",
"type_name": "Squirting"
},
{
"type_id": "/v18/tag/4hr/",
"type_name": "4HR+"
},
{
"type_id": "/v2/tag/3p-4p/",
"type_name": "3P, 4P"
},
{
"type_id": "/v1/tag/uniform/",
"type_name": "Uniform"
},
{
"type_id": "/v2/tag/30-s/",
"type_name": "30S"
},
{
"type_id": "/v1/tag/50-s/",
"type_name": "50S"
},
{
"type_id": "/v1/tag/40-s/",
"type_name": "40S"
},
{
"type_id": "/v1/tag/69/",
"type_name": "69"
},
{
"type_id": "/v5/tag/adultery/",
"type_name": "Adultery"
},
{
"type_id": "/v1/tag/abuse/",
"type_name": "Abuse"
},
{
"type_id": "/v3/tag/1080p/",
"type_name": "1080p"
},
{
"type_id": "/v3/tag/adult-movie/",
"type_name": "Adult Movie"
},
{
"type_id": "/v2/tag/ami-kiuchi-akina-sakura/",
"type_name": "Ami Kiuchi, Akina Sakura"
},
{
"type_id": "/v1/tag/anal-play/",
"type_name": "Anal Play"
},
{
"type_id": "/v2/tag/anal/",
"type_name": "Anal"
},
{
"type_id": "/v1/tag/anal-sex/",
"type_name": "Anal Sex"
},
{
"type_id": "/v1/tag/anal-training/",
"type_name": "Anal Training"
},
{
"type_id": "/v5/tag/anna/",
"type_name": "Anna"
},
{
"type_id": "/v4/tag/anri/",
"type_name": "Anri"
},
{
"type_id": "/v1/tag/aokan/",
"type_name": "aokan"
},
{
"type_id": "/v1/tag/aozora-sex/",
"type_name": "Aozora Sex"
},
{
"type_id": "/v4/tag/av-actress/",
"type_name": "Av Actress"
},
{
"type_id": "/v8/tag/av-open-2015-cougar-division/",
"type_name": "AV OPEN 2015 Cougar Division"
},
{
"type_id": "/v5/tag/aya/",
"type_name": "Aya"
},
{
"type_id": "/v11/tag/bareback/",
"type_name": "Bareback"
},
{
"type_id": "/v1/tag/bbw/",
"type_name": "Bbw"
},
{
"type_id": "/v11/tag/beautiful-girl/",
"type_name": "Beautiful Girl"
},
{
"type_id": "/v2/tag/beautiful-tits/",
"type_name": "Beautiful Tits"
},
{
"type_id": "/v1/tag/beautiful-pussy/",
"type_name": "Beautiful Pussy"
},
{
"type_id": "/v2/tag/beauty-shop/",
"type_name": "Beauty Shop"
},
{
"type_id": "/v25/tag/big-tits/",
"type_name": "Big-tits"
},
{
"type_id": "/v1/tag/beautiful-woman/",
"type_name": "Beautiful Woman"
},
{
"type_id": "/v2/tag/best-omnibus/",
"type_name": "Best, Omnibus"
},
{
"type_id": "/v1/tag/big-asses/",
"type_name": "Big Asses"
},
{
"type_id": "/v1/tag/big-vibrator/",
"type_name": "Big Vibrator"
},
{
"type_id": "/v2/tag/big-tits-lover/",
"type_name": "Big Tits Lover"
},
{
"type_id": "/v1/tag/bikyaku/",
"type_name": "Bikyaku"
},
{
"type_id": "/v1/tag/binyuu/",
"type_name": "Binyuu"
},
{
"type_id": "/v1/tag/bishiri/",
"type_name": "Bishiri"
},
{
"type_id": "/v1/tag/black-man/",
"type_name": "Black Man"
},
{
"type_id": "/v1/tag/black-hair/",
"type_name": "Black Hair"
},
{
"type_id": "/v4/tag/blowjob/",
"type_name": "Blowjob"
},
{
"type_id": "/v1/tag/bontage/",
"type_name": "bontage"
},
{
"type_id": "/v4/tag/breasts/",
"type_name": "Breasts"
},
{
"type_id": "/v1/tag/breast-milk/",
"type_name": "Breast Milk"
},
{
"type_id": "/v1/tag/bribri/",
"type_name": "Bribri"
},
{
"type_id": "/v2/tag/bukkake/",
"type_name": "BUKKAKE"
},
{
"type_id": "/v1/tag/celebrity/",
"type_name": "Celebrity"
},
{
"type_id": "/v5/tag/c-cup/",
"type_name": "C Cup"
},
{
"type_id": "/v42/tag/censored/",
"type_name": "Censored"
},
{
"type_id": "/v1/tag/changing-room/",
"type_name": "Changing Room"
},
{
"type_id": "/v7/tag/cheating-wife/",
"type_name": "Cheating Wife"
},
{
"type_id": "/v4/tag/cherry-boy/",
"type_name": "Cherry Boy"
},
{
"type_id": "/v6/tag/chihiro-akino/",
"type_name": "Chihiro Akino"
},
{
"type_id": "/v1/tag/chijyo/",
"type_name": "Chijyo"
},
{
"type_id": "/v1/tag/chikan/",
"type_name": "chikan"
},
{
"type_id": "/v1/tag/chubby/",
"type_name": "Chubby"
},
{
"type_id": "/v1/tag/clear/",
"type_name": "Clear"
},
{
"type_id": "/v1/tag/clothed-titty-fuck/",
"type_name": "Clothed Titty Fuck"
},
{
"type_id": "/v9/tag/compilation/",
"type_name": "Compilation"
},
{
"type_id": "/v2/tag/cosplay/",
"type_name": "Cosplay"
},
{
"type_id": "/v3/tag/college-girl/",
"type_name": "College Girl"
},
{
"type_id": "/v2/tag/confinement/",
"type_name": "Confinement"
},
{
"type_id": "/v2/tag/couple/",
"type_name": "Couple"
},
{
"type_id": "/v3/tag/cowgirl/",
"type_name": "Cowgirl"
},
{
"type_id": "/v1/tag/couple-swapping/",
"type_name": "Couple Swapping"
},
{
"type_id": "/v1/tag/cross-dressing/",
"type_name": "Cross Dressing"
},
{
"type_id": "/v3/tag/cunnilingus/",
"type_name": "Cunnilingus"
},
{
"type_id": "/v1/tag/deep-throating/",
"type_name": "Deep Throating"
},
{
"type_id": "/v1/tag/dead-drunk/",
"type_name": "Dead Drunk"
},
{
"type_id": "/v1/tag/debut/",
"type_name": "Debut"
},
{
"type_id": "/v1/tag/cyoushin/",
"type_name": "Cyoushin"
},
{
"type_id": "/v7/tag/dildo/",
"type_name": "Dildo"
},
{
"type_id": "/v1/tag/dirty-talk/",
"type_name": "Dirty Talk"
},
{
"type_id": "/v4/tag/drama/",
"type_name": "Drama"
},
{
"type_id": "/v1/tag/dmm-exclusive/",
"type_name": "DMM Exclusive"
},
{
"type_id": "/v6/tag/documentary/",
"type_name": "Documentary"
},
{
"type_id": "/v1/tag/eatpussy/",
"type_name": "Eatpussy"
},
{
"type_id": "/v2/tag/exclusive/",
"type_name": "Exclusive"
},
{
"type_id": "/v1/tag/exposure/",
"type_name": "Exposure"
},
{
"type_id": "/v9/tag/extra-movie/",
"type_name": "Extra Movie"
},
{
"type_id": "/v1/tag/fairness/",
"type_name": "Fairness"
},
{
"type_id": "/v1/tag/fair-skin/",
"type_name": "Fair Skin"
},
{
"type_id": "/v2/tag/fan-appreciation-home-visit/",
"type_name": "Fan Appreciation/ Home Visit"
},
{
"type_id": "/v16/tag/featured-actress/",
"type_name": "Featured Actress"
},
{
"type_id": "/v56/tag/fc2/",
"type_name": "Fc2"
},
{
"type_id": "/v11/tag/fc2-ppv/",
"type_name": "Fc2-Ppv"
},
{
"type_id": "/v1/tag/fellatio/",
"type_name": "Fellatio"
},
{
"type_id": "/v1/tag/female-boss/",
"type_name": "Female Boss"
},
{
"type_id": "/v1/tag/female-doctor/",
"type_name": "Female Doctor"
},
{
"type_id": "/v1/tag/female-investigator/",
"type_name": "Female Investigator"
},
{
"type_id": "/v3/tag/female-teacher/",
"type_name": "Female Teacher"
},
{
"type_id": "/v2/tag/fetish/",
"type_name": "Fetish"
},
{
"type_id": "/v1/tag/fisting/",
"type_name": "Fisting"
},
{
"type_id": "/v1/tag/foot-fetish/",
"type_name": "Foot Fetish"
},
{
"type_id": "/v3/tag/fingering/",
"type_name": "Fingering"
},
{
"type_id": "/v2/tag/first-time-drinking-semen/",
"type_name": "First Time Drinking Semen"
},
{
"type_id": "/v1/tag/gansha/",
"type_name": "Gansha"
},
{
"type_id": "/v1/tag/gym-clothes/",
"type_name": "Gym Clothes"
},
{
"type_id": "/v1/tag/golden-shower/",
"type_name": "Golden Shower"
},
{
"type_id": "/v3/tag/groping/",
"type_name": "Groping"
},
{
"type_id": "/v1/tag/gbei/",
"type_name": "G杯"
},
{
"type_id": "/v1/tag/hame/",
"type_name": "Hame"
},
{
"type_id": "/v5/tag/handjob/",
"type_name": "Handjob"
},
{
"type_id": "/v1/tag/h-cup/",
"type_name": "H Cup"
},
{
"type_id": "/v1/tag/hentai/",
"type_name": "hentai"
},
{
"type_id": "/v18/tag/hi-def/",
"type_name": "Hi-Def"
},
{
"type_id": "/v2/tag/homemade/",
"type_name": "Homemade"
},
{
"type_id": "/v2/tag/himari/",
"type_name": "Himari"
},
{
"type_id": "/v10/tag/hotel/",
"type_name": "Hotel"
},
{
"type_id": "/v1/tag/huge-butt/",
"type_name": "Huge Butt"
},
{
"type_id": "/v1/tag/how-to/",
"type_name": "How To"
},
{
"type_id": "/v2/tag/hot-spring/",
"type_name": "Hot Spring"
},
{
"type_id": "/v3/tag/huge-tits/",
"type_name": "Huge Tits"
},
{
"type_id": "/v5/tag/humiliation/",
"type_name": "Humiliation"
},
{
"type_id": "/v1/tag/ingo/",
"type_name": "Ingo"
},
{
"type_id": "/v1/tag/internal-ejaculation/",
"type_name": "Internal Ejaculation"
},
{
"type_id": "/v1/tag/iramatio/",
"type_name": "Iramatio"
},
{
"type_id": "/v1/tag/kaori/",
"type_name": "Kaori"
},
{
"type_id": "/v4/tag/kawaii/",
"type_name": "Kawaii"
},
{
"type_id": "/v1/tag/k-cup/",
"type_name": "K Cup"
},
{
"type_id": "/v5/tag/kimono/",
"type_name": "KIMONO"
},
{
"type_id": "/v1/tag/kimono-mourning/",
"type_name": "Kimono, Mourning"
},
{
"type_id": "/v2/tag/kimonoyukata/",
"type_name": "Kimono・Yukata"
},
{
"type_id": "/v2/tag/kiss-kiss/",
"type_name": "Kiss Kiss"
},
{
"type_id": "/v1/tag/kosupre/",
"type_name": "Kosupre"
},
{
"type_id": "/v1/tag/kusco/",
"type_name": "kusco"
},
{
"type_id": "/v2/tag/kyonyu/",
"type_name": "kyonyu"
},
{
"type_id": "/v6/tag/lesbian-kissing/",
"type_name": "Lesbian Kissing"
},
{
"type_id": "/v37/tag/lesbian/",
"type_name": "Lesbian"
},
{
"type_id": "/v13/tag/lotion/",
"type_name": "Lotion"
},
{
"type_id": "/v1/tag/m-jo/",
"type_name": "M-jo"
},
{
"type_id": "/v3/tag/madonna/",
"type_name": "Madonna"
},
{
"type_id": "/v1/tag/maid-cosplay/",
"type_name": "Maid Cosplay"
},
{
"type_id": "/v1/tag/mask/",
"type_name": "Mask"
},
{
"type_id": "/v6/tag/massage/",
"type_name": "Massage"
},
{
"type_id": "/v17/tag/massage-parlor/",
"type_name": "Massage Parlor"
},
{
"type_id": "/v4/tag/masterbation/",
"type_name": "masterbation"
},
{
"type_id": "/v29/tag/mature-woman/",
"type_name": "Mature Woman"
},
{
"type_id": "/v2/tag/milf/",
"type_name": "MILF"
},
{
"type_id": "/v1/tag/masturbation-support/",
"type_name": "Masturbation Support"
},
{
"type_id": "/v1/tag/mother/",
"type_name": "Mother"
},
{
"type_id": "/v1/tag/nasty-hardcore/",
"type_name": "Nasty, Hardcore"
},
{
"type_id": "/v6/tag/natsuki/",
"type_name": "Natsuki"
},
{
"type_id": "/v1/tag/neat-and-clean/",
"type_name": "Neat And Clean"
},
{
"type_id": "/v1/tag/netori/",
"type_name": "Netori"
},
{
"type_id": "/v3/tag/nicetitties/",
"type_name": "nicetitties"
},
{
"type_id": "/v11/tag/new-original-movie/",
"type_name": "New Original Movie"
},
{
"type_id": "/v1/tag/nymphomaniac/",
"type_name": "Nymphomaniac"
},
{
"type_id": "/v11/tag/office-ks-sod-sale/",
"type_name": "OFFICE K’S / SOD SALE"
},
{
"type_id": "/v17/tag/office-lady/",
"type_name": "Office Lady"
},
{
"type_id": "/v1/tag/ona-support/",
"type_name": "Ona Support"
},
{
"type_id": "/v7/tag/older-sister/",
"type_name": "Older Sister"
},
{
"type_id": "/v1/tag/orgasm/",
"type_name": "Orgasm"
},
{
"type_id": "/v3/tag/orgy/",
"type_name": "Orgy"
},
{
"type_id": "/v1/tag/outdoors/",
"type_name": "Outdoors"
},
{
"type_id": "/v21/tag/over-4-hours/",
"type_name": "Over 4 Hours"
},
{
"type_id": "/v1/tag/other-fetish/",
"type_name": "Other Fetish"
},
{
"type_id": "/v2/tag/other-fetishes/",
"type_name": "Other Fetishes"
},
{
"type_id": "/v1/tag/outdoor/",
"type_name": "Outdoor"
},
{
"type_id": "/v1/tag/peach-butt/",
"type_name": "Peach Butt"
},
{
"type_id": "/v1/tag/pajamas/",
"type_name": "Pajamas"
},
{
"type_id": "/v1/tag/panty-shot/",
"type_name": "Panty Shot"
},
{
"type_id": "/v2/tag/panty-shots/",
"type_name": "Panty Shots"
},
{
"type_id": "/v1/tag/personal-photoshoot/",
"type_name": "Personal Photoshoot"
},
{
"type_id": "/v23/tag/picking-up-girls/",
"type_name": "Picking Up Girls"
},
{
"type_id": "/v2/tag/pissingincontinence/",
"type_name": "Pissing・Incontinence"
},
{
"type_id": "/v1/tag/petite/",
"type_name": "Petite"
},
{
"type_id": "/v8/tag/planning/",
"type_name": "Planning"
},
{
"type_id": "/v1/tag/prank/",
"type_name": "Prank"
},
{
"type_id": "/v1/tag/porn-star/",
"type_name": "Porn Star"
},
{
"type_id": "/v3/tag/premium/",
"type_name": "Premium"
},
{
"type_id": "/v5/tag/pov/",
"type_name": "POV"
},
{
"type_id": "/v4/tag/pranks/",
"type_name": "Pranks"
},
{
"type_id": "/v6/tag/promiscuity/",
"type_name": "Promiscuity"
},
{
"type_id": "/v1/tag/rankou/",
"type_name": "Rankou"
},
{
"type_id": "/v1/tag/raw-saddle/",
"type_name": "Raw Saddle"
},
{
"type_id": "/v1/tag/quickie/",
"type_name": "Quickie"
},
{
"type_id": "/v4/tag/reversed-role/",
"type_name": "Reversed Role"
},
{
"type_id": "/v22/tag/red-hot-fetish-collection/",
"type_name": "Red Hot Fetish Collection"
},
{
"type_id": "/v2/tag/rental-girlfriend/",
"type_name": "Rental Girlfriend"
},
{
"type_id": "/v1/tag/relatives/",
"type_name": "Relatives"
},
{
"type_id": "/v1/tag/reverse-pick-up/",
"type_name": "Reverse Pick-Up"
},
{
"type_id": "/v15/tag/rocket/",
"type_name": "Rocket"
},
{
"type_id": "/v1/tag/runa/",
"type_name": "Runa"
},
{
"type_id": "/v1/tag/rolling-back-eyes-fainting/",
"type_name": "Rolling Back Eyes / Fainting"
},
{
"type_id": "/v1/tag/rough-sex/",
"type_name": "Rough Sex"
},
{
"type_id": "/v4/tag/s-cute-prestige-gogos-sale/",
"type_name": "S-Cute / Prestige / Gogos SALE"
},
{
"type_id": "/v1/tag/sale-limited-time/",
"type_name": "Sale (limited time)"
},
{
"type_id": "/v1/tag/school-girls/",
"type_name": "School Girls"
},
{
"type_id": "/v11/tag/schoolgirl/",
"type_name": "Schoolgirl"
},
{
"type_id": "/v2/tag/sauna/",
"type_name": "Sauna"
},
{
"type_id": "/v1/tag/secretary/",
"type_name": "Secretary"
},
{
"type_id": "/v5/tag/school-uniform/",
"type_name": "School Uniform"
},
{
"type_id": "/v4/tag/series/",
"type_name": "Series"
},
{
"type_id": "/v4/tag/sex-toys/",
"type_name": "Sex Toys"
},
{
"type_id": "/v1/tag/sexy-legs/",
"type_name": "Sexy Legs"
},
{
"type_id": "/v2/tag/shaved-pussy/",
"type_name": "Shaved Pussy"
},
{
"type_id": "/v1/tag/shame/",
"type_name": "Shame"
},
{
"type_id": "/v1/tag/shemale/",
"type_name": "Shemale"
},
{
"type_id": "/v6/tag/she/",
"type_name": "She"
},
{
"type_id": "/v1/tag/shiofuki/",
"type_name": "Shiofuki"
},
{
"type_id": "/v8/tag/sister/",
"type_name": "Sister"
},
{
"type_id": "/v1/tag/sixtynine/",
"type_name": "Sixtynine"
},
{
"type_id": "/v4/tag/small-tits/",
"type_name": "Small Tits"
},
{
"type_id": "/v10/tag/slut/",
"type_name": "Slut"
},
{
"type_id": "/v8/tag/solowork/",
"type_name": "Solowork"
},
{
"type_id": "/v1/tag/sperm-donation/",
"type_name": "Sperm Donation"
},
{
"type_id": "/v1/tag/sokkuri/",
"type_name": "sokkuri"
},
{
"type_id": "/v1/tag/special-smartphone-vertical-video/",
"type_name": "Special Smartphone Vertical Video"
},
{
"type_id": "/v1/tag/sport/",
"type_name": "Sport"
},
{
"type_id": "/v1/tag/sports/",
"type_name": "Sports"
},
{
"type_id": "/v2/tag/submissive-men/",
"type_name": "Submissive Men"
},
{
"type_id": "/v1/tag/stepmom/",
"type_name": "Stepmom"
},
{
"type_id": "/v1/tag/strong-sexual-desire/",
"type_name": "Strong Sexual Desire"
},
{
"type_id": "/v1/tag/stewardess/",
"type_name": "Stewardess"
},
{
"type_id": "/v1/tag/substance-use/",
"type_name": "Substance Use"
},
{
"type_id": "/v10/tag/subtitles/",
"type_name": "Subtitles"
},
{
"type_id": "/v1/tag/swallow/",
"type_name": "Swallow"
},
{
"type_id": "/v3/tag/threesome-foursome/",
"type_name": "Threesome / Foursome"
},
{
"type_id": "/v5/tag/titty-fuck/",
"type_name": "Titty Fuck"
},
{
"type_id": "/v1/tag/tittyfuck/",
"type_name": "Tittyfuck"
},
{
"type_id": "/v2/tag/too-wet/",
"type_name": "Too Wet"
},
{
"type_id": "/v1/tag/training/",
"type_name": "Training"
},
{
"type_id": "/v1/tag/toys/",
"type_name": "Toys"
},
{
"type_id": "/v1/tag/transformed-heroine/",
"type_name": "Transformed Heroine"
},
{
"type_id": "/v4/tag/transsexual/",
"type_name": "Transsexual"
},
{
"type_id": "/v9/tag/trip/",
"type_name": "Trip"
},
{
"type_id": "/v3/tag/two-consecutive-creampies/",
"type_name": "Two Consecutive Creampies"
},
{
"type_id": "/v1/tag/tutor/",
"type_name": "Tutor"
},
{
"type_id": "/v2/tag/ultra-huge-tits/",
"type_name": "Ultra-Huge Tits"
},
{
"type_id": "/v12/tag/uncensored/",
"type_name": "Uncensored"
},
{
"type_id": "/v1/tag/underwear/",
"type_name": "Underwear"
},
{
"type_id": "/v1/tag/user-submission/",
"type_name": "User Submission"
},
{
"type_id": "/v1/tag/urination/",
"type_name": "Urination"
},
{
"type_id": "/v5/tag/various-worker/",
"type_name": "Various Worker"
},
{
"type_id": "/v25/tag/variety/",
"type_name": "Variety"
},
{
"type_id": "/v1/tag/vibe/",
"type_name": "Vibe"
},
{
"type_id": "/v5/tag/vibrator/",
"type_name": "Vibrator"
},
{
"type_id": "/v5/tag/virgin-man/",
"type_name": "Virgin Man"
},
{
"type_id": "/v14/tag/voyeur/",
"type_name": "Voyeur"
},
{
"type_id": "/v1/tag/yokui/",
"type_name": "Yokui"
},
{
"type_id": "/v2/tag/youthful/",
"type_name": "Youthful"
},
{
"type_id": "/v1/tag/yukata/",
"type_name": "Yukata"
},
{
"type_id": "/v1/tag/huruhaibiziyon-fhd/",
"type_name": "フルハイビジョン(FHD)"
},
{
"type_id": "/v1/tag/wu-shi-lu/",
"type_name": "五十路"
},
{
"type_id": "/v2/tag/pei-xin-zhuan-yong-su-ren/",
"type_name": "配信専用素人"
}
];

const appConfig = {
    ver: 1,
    title: 'BestJavPorn',
    site: HOST,
    tabs: CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function clean(s) {
    return t(s)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ');
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return HOST + (u.startsWith('/') ? u : '/' + u);
}

// ---------------- 解析 (严格层 + 宽松层, 逐字沿用猫版) ----------------
function parseCardsStrict(html) {
    const out = [];
    const re = /<article[^>]*class="[^"]*thumb-block[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    let m;
    while ((m = re.exec(html))) {
        const block = m[1];
        if (/thumb-block-native-ad|native-banner/.test(m[0])) continue;
        const a = block.match(/<a href="(https:\/\/(?:www\.)?bestjavporn\.com\/(?:v\d+\/)?video\/[^"]+)" title="([^"]*)"/);
        if (!a) continue;
        const img = block.match(/data-lazy-src="([^"]+)"/) || block.match(/data-wpsrc="([^"]+)"/);
        const dur = block.match(/<span class="duration">[\s\S]*?([\d]{1,2}:[\d]{2}(?::[\d]{2})?)\s*<\/span>/);
        const views = block.match(/<span class="views">[\s\S]*?([\d,]+)\s*<\/span>/);
        const remarks = [dur ? dur[1] : '', views ? views[1] + ' views' : ''].filter(Boolean).join(' · ');
        out.push({
            vod_id: a[1],
            vod_name: clean(a[2]),
            vod_pic: img ? img[1] : '',
            vod_remarks: remarks,
        });
    }
    return out;
}

function parseCardsLoose(html) {
    const out = [];
    const seen = new Set();
    const h = String(html || '');
    const re = /<a\b[^>]*?href\s*=\s*["']((?:https?:\/\/(?:www\.)?bestjavporn\.com)?\/(?:v\d+\/)?video\/[^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(h)) !== null) {
        let url = m[1];
        if (url.startsWith('/')) url = HOST + url;
        url = url.replace(/^http:\/\//, 'https://');
        if (seen.has(url)) continue;
        seen.add(url);
        const tag = m[0];
        const win = h.slice(m.index, m.index + 1800);
        let name = '';
        const tm = tag.match(/title\s*=\s*"([^"]+)"/) || tag.match(/title\s*=\s*'([^']+)'/);
        if (tm) name = clean(tm[1]);
        if (!name) {
            const altM = win.match(/<img[^>]+alt="([^"]{4,})"/);
            if (altM) name = clean(altM[1]);
        }
        if (!name) {
            const txtM = win.match(/<header class="entry-header">\s*<span>([^<]{4,})<\/span>/);
            if (txtM) name = clean(txtM[1]);
        }
        if (!name) name = url.split('/video/')[1].replace(/\//g, '');
        const img = win.match(/data-lazy-src="(https:[^"]+)"/) || win.match(/data-wpsrc="(https:[^"]+)"/);
        const dur = win.match(/<span class="duration">[\s\S]*?([\d]{1,2}:[\d]{2}(?::[\d]{2})?)\s*<\/span>/);
        const views = win.match(/<span class="views">[\s\S]*?([\d,]+)\s*<\/span>/);
        const remarks = [dur ? dur[1] : '', views ? views[1] + ' views' : ''].filter(Boolean).join(' · ');
        out.push({ vod_id: url, vod_name: name, vod_pic: img ? img[1] : '', vod_remarks: remarks });
    }
    return out;
}

function parseCards(html) {
    const strict = parseCardsStrict(html);
    const byUrl = new Map(strict.map((c) => [c.vod_id, c]));
    for (const c of parseCardsLoose(html)) {
        if (!byUrl.has(c.vod_id)) byUrl.set(c.vod_id, c);
    }
    return [...byUrl.values()];
}

function toCards(list) {
    return (list || []).map((c) => ({
        vod_id: c.vod_id,
        vod_name: c.vod_name,
        vod_pic: c.vod_pic,
        vod_remarks: c.vod_remarks,
        ext: { id: c.vod_id },
    }));
}

// ---------------- 取数层 ($fetch 为主, 通道串行, 逐字对齐猫版线格式) ----------------
const BROWSER_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
};

function isShellPage(s) {
    return /Attention Required|Just a moment|cf-challenge|Checking your browser/i.test(s || '');
}
function validListPage(html) {
    return !!html && !isShellPage(html) && parseCards(html).length > 0;
}
function validDetailPage(html) {
    return !!html && !isShellPage(html) && html.length > 4000 &&
        (html.includes('data-mpu') || html.includes('video-id=') || /property="og:title"/.test(html));
}
function validEmbedPage(html) {
    return !!html && !isShellPage(html) && html.length > 200 && html.includes('data-config');
}
function validFor(kind, html) {
    if (kind === 'detail') return validDetailPage(html);
    if (kind === 'embed') return validEmbedPage(html);
    return validListPage(html);
}

// $fetch 统一原语: data 对象/字符串两兼容, 回 {status, body(字符串)}。
async function rawReq(url, headers, method, body) {
    try {
        let r;
        if (method === 'POST') r = await $fetch.post(url, body, { headers: headers || {} });
        else r = await $fetch.get(url, { headers: headers || {} });
        if (!r) return { status: 0, body: '' };
        const d = r.data;
        let s = '';
        if (typeof d === 'string') s = d;
        else if (d !== null && d !== undefined) { try { s = JSON.stringify(d); } catch (e) { s = ''; } }
        return { status: r.status || (s ? 200 : 0), body: s };
    } catch (e) {
        return { status: 0, body: '', err: String((e && e.message) || e) };
    }
}

const OWN_HOST_RE = /(^|\.)(javhdporn\.net|bestjavporn\.com|pornfhd\.com)$/i;
async function chOwn(url, referer) {
    try {
        if (!OWN_HOST_RE.test(new URL(url).hostname)) return { status: 0, body: '' };
    } catch (e) { return { status: 0, body: '' }; }
    const w = OWN_FETCH + '/get?u=' + encodeURIComponent(url) + '&ref=' + encodeURIComponent(referer || REFERER);
    return rawReq(w, { 'User-Agent': UA });
}

async function chDirect(url, referer) {
    return rawReq(url, { ...BROWSER_HEADERS, Referer: referer || REFERER });
}

// workers.dev 公共 demo 的 /search/ 规范前缀学习 (沿用猫版)
let learnedPrefix = '';
function notePrefix(html) {
    const m = String(html || '').match(/bestjavporn\.com(\/v\d+)\/search\//);
    if (m) { learnedPrefix = m[1]; return; }
    if (!learnedPrefix) {
        const m2 = String(html || '').match(/bestjavporn\.com(\/v\d+)\//);
        if (m2) learnedPrefix = m2[1];
    }
}
function wdTarget(url) {
    try {
        const u = new URL(url);
        if (u.pathname.startsWith('/search/') && learnedPrefix) u.pathname = learnedPrefix + u.pathname;
        return u.toString();
    } catch (e) { return url; }
}
const WD_HEADERS = { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Origin: HOST };
async function chDemo(url) {
    return rawReq('https://test.cors.workers.dev/?' + wdTarget(url), WD_HEADERS);
}
async function chJina(url) {
    return rawReq('https://r.jina.ai/' + url, { 'User-Agent': UA, 'x-respond-with': 'html' });
}
async function chAoRaw(url) {
    return rawReq('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { 'User-Agent': UA });
}
async function chCodetabs(url) {
    return rawReq('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url), { 'User-Agent': UA });
}

// 串行取页: 猫版竞速波次改串行逐通道试, 首个合格即回 {html, win}。
// list/detail 波次: own -> direct -> demo -> jina -> aoRaw -> codetabs -> jina 再试。
// embed 波次: 出口一致性优先 (文件令牌绑 embed 查看者 IP): direct -> own -> demo -> jina -> aoRaw;
//   win==='direct' 时 direct=true (令牌绑设备 IP, 与播放器自洽)。
async function fetchPage(url, opts) {
    opts = opts || {};
    const kind = opts.kind || 'list';
    const referer = opts.referer;
    let wave;
    if (opts.profile === 'embed') {
        wave = [
            ['direct', () => chDirect(url, referer)],
            ['own', () => chOwn(url, referer)],
            ['demo', () => chDemo(url)],
            ['jina', () => chJina(url)],
            ['aoRaw', () => chAoRaw(url)],
        ];
    } else {
        wave = [
            ['own', () => chOwn(url, referer)],
            ['direct', () => chDirect(url, referer)],
            ['demo', () => chDemo(url)],
            ['jina', () => chJina(url)],
            ['aoRaw', () => chAoRaw(url)],
            ['codetabs', () => chCodetabs(url)],
        ];
    }
    for (const [name, fn] of wave) {
        let res;
        try { res = await fn(); } catch (e) { res = { status: 0, body: '' }; }
        const body = (res && res.body) || '';
        if (validFor(kind, body)) {
            notePrefix(body);
            return { html: body, win: name };
        }
    }
    return { html: '', win: '' };
}

// ---------------- POST /api/play/ 现铸 (库未命中回退, $fetch.post 待真机验) ----------------
function validPlayResp(text) {
    if (!text) return false;
    try {
        const j = JSON.parse(text);
        return !!j && typeof j === 'object' && j.status === true;
    } catch (e) { return false; }
}

// 串行铸造: own(/post) -> direct -> demo -> own 再一发 (猫版 own 间隔三发改串行两发, 无定时)。
async function httpPostForm(url, bodyStr, referer) {
    referer = referer || REFERER;
    const formHeaders = {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': referer,
        'Origin': HOST,
    };
    const ownPost = () => {
        const w = OWN_FETCH + '/post?u=' + encodeURIComponent(url) + '&ref=' + encodeURIComponent(referer);
        return rawReq(w, { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, 'POST', bodyStr);
    };
    const attempts = [
        ['own', ownPost],
        ['direct', () => rawReq(url, formHeaders, 'POST', bodyStr)],
        ['demo', () => rawReq('https://test.cors.workers.dev/?' + url, { ...WD_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, 'POST', bodyStr)],
        ['own2', ownPost],
    ];
    let sawJson = false;
    for (const [name, fn] of attempts) {
        let res;
        try { res = await fn(); } catch (e) { res = { status: 0, body: '' }; }
        const text = (res && res.body) || '';
        if (text) {
            try { const j = JSON.parse(text); if (j && typeof j === 'object' && 'status' in j) sawJson = true; } catch (e) {}
        }
        if (validPlayResp(text)) return { text, via: name, stage: 'ok' };
    }
    return { text: '', via: '', stage: sawJson ? 'post-bad' : 'post-none' };
}

// ---------------- 纯 JS 密码件 (与站方 cast.js / video main.js 同构, 逐字沿用猫版算法) ----------------
const B64CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64REV = (() => {
    const o = {};
    for (let i = 0; i < B64CH.length; i++) o[B64CH[i]] = i;
    o['-'] = 62; o['_'] = 63;
    return o;
})();

function b64ToBytes(s) {
    const str = String(s || '').replace(/[^A-Za-z0-9+/=_-]/g, '');
    const out = [];
    let acc = 0, bits = 0;
    for (const ch of str) {
        if (ch === '=') break;
        const v = B64REV[ch];
        if (v == null) continue;
        acc = (acc << 6) | v; bits += 6;
        if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return Uint8Array.from(out);
}

function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        s += B64CH[a >> 2] + B64CH[((a & 3) << 4) | (b >> 4)] +
            (i + 1 < bytes.length ? B64CH[((b & 15) << 2) | (c >> 6)] : '=') +
            (i + 2 < bytes.length ? B64CH[c & 63] : '=');
    }
    return s;
}

// UTF-8 手工编解码 (不依赖 TextEncoder/TextDecoder, XPTV 运行时未证实有此二件)
function utf8EncodeBytes(str) {
    const bytes = [];
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
        let cp = s.codePointAt(i);
        if (cp > 0xffff) i++;
        if (cp < 0x80) bytes.push(cp);
        else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
    return Uint8Array.from(bytes);
}
function strToB64(str) {
    return bytesToB64(utf8EncodeBytes(str));
}
function bytesToLatin1(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return s;
}
function bytesToUtf8(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i];
        if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
        else if (b >= 0xc0 && b < 0xe0 && i + 1 < bytes.length) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
        else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) { out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3; }
        else if (b >= 0xf0 && i + 3 < bytes.length) {
            const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            const c = cp - 0x10000;
            out += String.fromCharCode(0xd800 | (c >> 10), 0xdc00 | (c & 0x3ff));
            i += 4;
        } else { out += String.fromCharCode(b); i += 1; }
    }
    return out;
}

function rc4(keyStr, data) {
    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) S[i] = i;
    const kb = [];
    for (let i = 0; i < keyStr.length; i++) kb.push(keyStr.charCodeAt(i) & 0xff);
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + S[i] + kb[i % kb.length]) & 0xff;
        const tmp = S[i]; S[i] = S[j]; S[j] = tmp;
    }
    let a = 0; j = 0;
    const out = new Uint8Array(data.length);
    for (let n = 0; n < data.length; n++) {
        a = (a + 1) & 0xff;
        j = (j + S[a]) & 0xff;
        const tmp = S[a]; S[a] = S[j]; S[j] = tmp;
        out[n] = data[n] ^ S[(S[a] + S[j]) & 0xff];
    }
    return out;
}

// dex(seed, data) = b64decode( RC4( reverse(b64(seed + '_0x58fe15')), b64decode(data) ) )
function dex(seed, data) {
    const key = strToB64(String(seed) + '_0x58fe15').split('').reverse().join('');
    const mid = bytesToLatin1(rc4(key, b64ToBytes(data)));
    return bytesToLatin1(b64ToBytes(mid));
}
function dexUtf8(seed, data) {
    const key = strToB64(String(seed) + '_0x58fe15').split('').reverse().join('');
    const mid = bytesToLatin1(rc4(key, b64ToBytes(data)));
    return bytesToUtf8(b64ToBytes(mid));
}

// embed 页 data-config 解密: key = reverse( b64( b64(pathname+search).substr(4,20) + '_0x59a0e4' ) )
function decryptConfig(cfgB64, pathname, search) {
    const arg = strToB64(String(pathname) + String(search)).substring(4, 20);
    const key = strToB64(arg + '_0x59a0e4').split('').reverse().join('');
    const pt = bytesToLatin1(rc4(key, b64ToBytes(cfgB64)));
    const json = JSON.parse(bytesToUtf8(b64ToBytes(pt)));
    const sources = JSON.parse(bytesToUtf8(b64ToBytes(json.src || '')));
    return { json, sources };
}

// ---------------- 播放解析 ----------------
function extractPlaySeed(html) {
    const postId = (html.match(/id="video-player-area"[^>]*video-id="(\d+)"/) || html.match(/video-id="(\d+)"/) || [])[1] || '';
    const mpu = (html.match(/data-mpu="([^"]+)"/) || [])[1] || '';
    return { postId, mpu };
}

// ---------------- 铸造库 (只读查库, 沿用猫版现行查法) ----------------
// 契约: GET {OWN_FETCH}/cast?u=<watch 页完整 URL> -> 命中 200 {"paths":[embed 路径数组]};
// 未命中 404。本模块只有此 GET 查库, 无任何写库逻辑。
async function castBankLookup(watchUrl) {
    try {
        const w = OWN_FETCH + '/cast?u=' + encodeURIComponent(watchUrl);
        const r = await rawReq(w, { 'User-Agent': UA });
        if (!r || r.status !== 200 || !r.body) return { hit: false };
        let j;
        try { j = JSON.parse(r.body); } catch (e) { return { hit: false }; }
        const seen = new Set();
        const arr = (j && Array.isArray(j.paths))
            ? j.paths.filter((p) => {
                if (typeof p !== 'string' || !p.startsWith('//') || seen.has(p)) return false;
                seen.add(p);
                return true;
            })
            : [];
        if (!arr.length) return { hit: false };
        return { hit: true, paths: arr.map((p, i) => ({ lo: i === 0 ? 'main' : 'bak', path: p })) };
    } catch (e) {
        return { hit: false };
    }
}

// 查库优先; 未命中回退模块内现铸 (POST /api/play/), 解出全部 embed 路径。
async function fetchEmbedPaths(postId, mpu, referer) {
    const bank = await castBankLookup(referer);
    if (bank.hit) return { paths: bank.paths, stage: 'ok', via: 'cast-bank' };
    const token = dex(postId, mpu);
    const body = 'sources=' + encodeURIComponent(token) + '&ver=2';
    const r = await httpPostForm(HOST + '/api/play/', body, referer);
    if (!r.text) return { paths: [], stage: r.stage || 'post-none', via: '' };
    let resp;
    try { resp = JSON.parse(r.text); } catch (e) { return { paths: [], stage: 'post-bad', via: r.via }; }
    if (!resp || resp.status !== true || !resp.data) return { paths: [], stage: 'post-bad', via: r.via };
    const paths = [];
    try { paths.push({ lo: t(resp.lo) || 'main', path: dex(postId, resp.data) }); } catch (e) {}
    if (resp.reserve) {
        try {
            const arr = JSON.parse(dexUtf8(postId, resp.reserve));
            for (const x of arr) {
                if (x && x.data) {
                    try { paths.push({ lo: t(x.lo) || 'bak', path: dex(postId, x.data) }); } catch (e) {}
                }
            }
        } catch (e) {}
    }
    return { paths: paths.filter((p) => p.path && p.path.startsWith('//')), stage: 'ok', via: r.via };
}

const HOST_PRETTY = [
    [/streamtape|tapecontent/i, 'StreamTape'],
    [/maxstream/i, 'MaxStream'],
    [/cloudatacdn|clouddata/i, 'CloudCDN'],
    [/streamhls/i, 'StreamHLS'],
    [/pianopic/i, 'PianoPic'],
    [/acek-cdn/i, 'AcekCDN'],
    [/hugstream/i, 'HugStream'],
    [/turbovid|turbo/i, 'TurboVid'],
    [/dood|ds2play|d0o0d/i, 'Dood'],
    [/filemoon|filemoonu/i, 'FileMoon'],
    [/vidhide|earnvid|vidhideplus/i, 'VidHide'],
    [/streamwish|wish/i, 'StreamWish'],
    [/voe/i, 'VOE'],
];
function prettyHost(fileUrl) {
    for (const [re, name] of HOST_PRETTY) if (re.test(fileUrl)) return name;
    try { return new URL(fileUrl).hostname.replace(/^www\./, ''); } catch (e) { return '线路'; }
}
function hostRank(name) {
    if (name === 'CloudCDN') return 0;
    if (name === 'MaxStream') return 1;
    if (name === 'StreamTape') return 2;
    if (name === 'AcekCDN') return 3;
    if (name === 'StreamHLS' || name === 'PianoPic') return 9;
    return 5;
}

// 线路出口分组: 0=直连解出 (令牌绑设备 IP); 1=借线 hugstream 前置 (master.txt, 不绑 IP);
// 2=借线绑定型宿主 (令牌绑代理出口, 设备必 403, 仅兜底)。
function lineGroup(ln) {
    if (ln.direct) return 0;
    if (/master\.txt(\?|$)/i.test(ln.parentFile || ln.file || '')) return 1;
    return 2;
}

async function resolveEmbed(embedUrl, referer) {
    const r = await fetchPage(embedUrl, { kind: 'embed', referer, profile: 'embed' });
    if (!r || !r.html) return null;
    const cfg = (r.html.match(/data-config="([^"]+)"/) || [])[1];
    if (!cfg) return null;
    let u;
    try { u = new URL(embedUrl); } catch (e) { return null; }
    try {
        const { sources } = decryptConfig(cfg, u.pathname, u.search);
        if (Array.isArray(sources) && sources.length) {
            return { sources, direct: r.win === 'direct' };
        }
    } catch (e) {}
    return null;
}

// ---------------- 清晰度展开 (沿用猫版高清修复) ----------------
function labelRes(label) {
    const m = t(label).match(/(\d{3,4})\s*p/i);
    return m ? parseInt(m[1], 10) : 0;
}
function parseVariants(body, base) {
    const out = [];
    const lines = String(body || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/#EXT-X-STREAM-INF:([^\r\n]*)/);
        if (!m) continue;
        const bw = parseInt((m[1].match(/BANDWIDTH=(\d+)/) || [])[1] || '0', 10);
        const rm = m[1].match(/RESOLUTION=(\d+)x(\d+)/);
        let q = rm ? parseInt(rm[2], 10) : 0;
        if (!q && bw) q = bw >= 2500000 ? 1080 : (bw >= 1100000 ? 720 : 480);
        let uri = '';
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            const s = lines[j].trim();
            if (s && !s.startsWith('#')) { uri = s; break; }
        }
        if (!uri) continue;
        try { uri = new URL(uri, base).toString(); } catch (e) { continue; }
        out.push({ file: uri, q, bw });
    }
    out.sort((a, b) => (b.q - a.q) || (b.bw - a.bw));
    return out;
}
// 主清单判形态: 只走 $fetch 直连 (与 embed 同为设备出口, 清单令牌自洽)。
async function fetchMasterVariants(file, referer) {
    try {
        const r = await rawReq(file, { 'User-Agent': UA, Referer: referer, Accept: '*/*' });
        if (!r || !r.body || !r.body.includes('#EXTM3U')) return null;
        const variants = parseVariants(r.body, file);
        if (variants.length) return { master: true, variants };
        if (r.body.includes('#EXTINF')) return { master: false, variants: [] };
        return null;
    } catch (e) { return null; }
}
// 一个 embed 的全部 sources -> 线路表: MP4 单条; HLS 多档主清单逐档一条 (q 降序);
// v = 该 embed 内序号 (getTracks/getPlayinfo 的 @@idx.v 对位约定)。
async function expandSources(sources, embedUrl) {
    const out = [];
    for (const s of (sources || [])) {
        if (!s || !s.file) continue;
        const isHls = /hls|m3u8/i.test(s.type || '') || /\.m3u8(\?|$)/i.test(s.file) || /\.txt(\?|$)/i.test(s.file);
        if (!isHls) { out.push({ file: s.file, type: t(s.type), q: labelRes(s.label), parent: s.file }); continue; }
        const mv = await fetchMasterVariants(s.file, embedUrl);
        if (mv && mv.master && mv.variants.length > 1) {
            for (const v of mv.variants) out.push({ file: v.file, type: 'hls', q: v.q, parent: s.file });
        } else if (mv && mv.master && mv.variants.length === 1) {
            out.push({ file: s.file, type: t(s.type), q: mv.variants[0].q || labelRes(s.label), parent: s.file });
        } else {
            out.push({ file: s.file, type: t(s.type), q: labelRes(s.label), parent: s.file });
        }
    }
    out.forEach((e, i) => { e.v = i; });
    return out;
}
function displayHost(file, embedUrl) {
    const h = prettyHost(file);
    try {
        if (new URL(file).hostname.replace(/^www\./, '') === h) {
            const eh = prettyHost(embedUrl);
            if (eh && eh !== h) return eh;
        }
    } catch (e) {}
    return h;
}

// 详情页缓存 (仅加速, 沿用猫版 5 分钟页缓存语义)
const pageCache = new Map();
function cacheGet(url, ttl) {
    const e = pageCache.get(url);
    if (e && Date.now() - e.ts < ttl) return e.s;
    return '';
}
function cacheSet(url, s) {
    pageCache.set(url, { ts: Date.now(), s });
    if (pageCache.size > 60) pageCache.delete(pageCache.keys().next().value);
}
async function getDetailHtml(durl) {
    const hit = cacheGet(durl, 300000);
    if (hit) return hit;
    const res = await fetchPage(durl, { kind: 'detail' });
    if (res.html) cacheSet(durl, res.html);
    return res.html;
}

// 全链解析 (串行版): {html, lines, stage}
// stage: ok / page(详情未取到) / seed(无种子) / post-none / post-bad / embed(embed未解出)
async function resolveLinesFresh(durl) {
    const html = await getDetailHtml(durl);
    if (!html) return { html: '', lines: [], stage: 'page' };
    const { postId, mpu } = extractPlaySeed(html);
    if (!postId || !mpu) return { html, lines: [], stage: 'seed' };
    const fp = await fetchEmbedPaths(postId, mpu, durl);
    if (!fp.paths.length) return { html, lines: [], stage: fp.stage, via: fp.via };
    const lines = [];
    const paths = fp.paths.slice(0, 8);
    for (let idx = 0; idx < paths.length; idx++) {
        const p = paths[idx];
        const embedUrl = 'https:' + p.path;
        const r = await resolveEmbed(embedUrl, durl);
        if (!r) continue;
        const expanded = await expandSources(r.sources, embedUrl);
        for (const e of expanded) {
            lines.push({ idx, v: e.v, lo: p.lo, embedUrl, file: e.file, parentFile: e.parent, type: e.type, host: displayHost(e.file, embedUrl), q: e.q, direct: !!r.direct });
        }
    }
    // 排序沿用猫版: 出口组 -> 清晰度降序 -> 宿主可靠性 -> 原序 (借线顶替守卫靠此序)。
    lines.sort((a, b) => (lineGroup(a) - lineGroup(b)) || ((b.q || 0) - (a.q || 0)) || (hostRank(a.host) - hostRank(b.host)) || (a.idx - b.idx) || ((a.v || 0) - (b.v || 0)));
    if (!lines.length) return { html, lines: [], stage: 'embed', via: fp.via };
    return { html, lines, stage: 'ok', via: fp.via };
}

const linesCache = new Map();
async function resolveLines(durl) {
    const hit = linesCache.get(durl);
    if (hit && Date.now() - hit.ts < 180000) return hit.r;
    const r = await resolveLinesFresh(durl);
    if (r && r.html) {
        linesCache.set(durl, { ts: Date.now(), r });
        if (linesCache.size > 20) linesCache.delete(linesCache.keys().next().value);
    }
    return r;
}

// ---------------- 五入口 ----------------
async function getConfig() {
    return jsonify(appConfig);
}

function listUrl(tid, page) {
    const path = tid.startsWith('/') ? tid : '/' + tid;
    return HOST + path + (page > 1 ? 'page/' + page + '/' : '');
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid || ext.id);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = CATS.find((c) => c.type_id === tid);
    if (!cat) return jsonify({ list: [] });
    let res = await fetchPage(listUrl(cat.type_id, page), { kind: 'list' });
    let list = res.html ? parseCards(res.html) : [];
    if (!list.length && /\/v\d+\//.test(cat.type_id)) {
        // 前缀漂移兜底: 无前缀路径 301 到当前前缀, 出 0 卡时串行重试一次 (沿用猫版)。
        const stripped = cat.type_id.replace(/\/v\d+(?=\/)/, '');
        const res2 = await fetchPage(listUrl(stripped, page), { kind: 'list' });
        const list2 = res2.html ? parseCards(res2.html) : [];
        if (list2.length) list = list2;
    }
    return jsonify({ list: toCards(list) });
}

const STAGE_TEXT = {
    page: '详情未取到',
    seed: '无播放种子',
    'post-none': '铸造通道不通',
    'post-bad': '铸造被站方拒',
    embed: 'embed未解出',
};

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = absUrl(id);
    let rl;
    try { rl = await resolveLines(durl); }
    catch (e) { rl = { html: '', lines: [], stage: 'error' }; }
    const lines = rl.lines || [];
    if (!lines.length) {
        // 铸造链没拿到线路: 单条网页嗅探兜底 (点播时整链重试, 仍不行落 watch 页)。
        const title = '网页嗅探·' + (STAGE_TEXT[rl.stage] || '铸造失败');
        return jsonify({
            list: [{
                title,
                tracks: [{ name: '正片', pan: '', ext: { id: durl + '@@sniff', flag: title } }],
            }],
        });
    }
    // 清晰度分组: 每档一个 group (title=档位, 降序, 首组最高档); 组内沿用全局序。
    const qGroups = new Map();
    lines.forEach((ln) => {
        const q = ln.q || 0;
        if (!qGroups.has(q)) qGroups.set(q, []);
        qGroups.get(q).push(ln);
    });
    const qOrder = [...qGroups.keys()].sort((a, b) => b - a);
    const groups = [];
    for (const q of qOrder) {
        const title = q ? q + 'p' : '默认';
        const seen = new Map();
        const tracks = qGroups.get(q).map((ln) => {
            let nm = ln.lo && ln.lo !== 'main' ? `${ln.host}·${ln.lo}` : ln.host;
            if (ln.direct) nm += '·直';
            const n = (seen.get(nm) || 0) + 1;
            seen.set(nm, n);
            if (n > 1) nm += '·' + n;
            return { name: nm, pan: '', ext: { id: durl + '@@' + ln.idx + '.' + (ln.v || 0), flag: title } };
        });
        groups.push({ title, tracks });
    }
    groups.push({
        title: '网页嗅探·兜底',
        tracks: [{ name: '播放', pan: '', ext: { id: durl + '@@sniff', flag: '网页嗅探·兜底' } }],
    });
    return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (id.endsWith('@@sniff')) id = id.slice(0, -'@@sniff'.length);
    const mm = id.match(/^(https?:\/\/\S+?)@@(\d+)(?:\.(\d+))?$/);
    const durl = mm ? mm[1] : absUrl(id);
    const wantIdx = mm ? parseInt(mm[2], 10) : -1;
    const wantV = mm && mm[3] !== undefined ? parseInt(mm[3], 10) : 0;
    let lines = [];
    try { lines = (await resolveLines(durl)).lines || []; } catch (e) { lines = []; }
    if (!lines.length) {
        // 嗅探兜底降级: 回 watch 页 URL (XPTV 无嗅探位, 待真机验)。
        return jsonify({ urls: [durl], headers: [{ 'User-Agent': UA, Referer: REFERER }] });
    }
    // 借线顶替守卫 (沿用猫版): 点的线与最优线同组才尊重选择, 否则回最优线
    // (借线绑定型令牌在设备必 403)。
    const tapped = lines.find((l) => l.idx === wantIdx && (l.v || 0) === wantV) || lines.find((l) => l.idx === wantIdx);
    const best = lines[0];
    const pick = (tapped && lineGroup(tapped) <= lineGroup(best)) ? tapped : best;
    return jsonify({
        urls: [pick.file],
        headers: [{ 'User-Agent': UA, Referer: pick.embedUrl }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = HOST + '/search/' + encodeURIComponent(wd) + '/' + (page > 1 ? 'page/' + page + '/' : '');
    const res = await fetchPage(url, { kind: 'list' });
    if (!res.html) return jsonify({ list: [] });
    return jsonify({ list: toCards(parseCards(res.html)) });
}
