// JAVIDEO - XPTV csp 格式（csp_javideo）
// 转换自 mira-cat nodejs/src/spider/video/javideo.js（py_javideo，977 行逐段核查）。站点 https://javideo.net
// 依赖 Worker：javideo-vidhide（https://javideo-vidhide.li768435813.workers.dev）—— SW/LLS(vidhide 系)全链代理，
// getPlayinfo 对 SW/LLS 返回 Worker /v 产出的 URL 原样直出（先经 $fetch 校验 /v 确为播放列表才用）。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）：/api/movie/getPlayer 为 JSON POST {id}，逐字保持猫侧线格式。
// 嗅探型播放降级：回源页 URL，待真机验 —— SW/LLS 蜘蛛内解包全灭时回 embed 页、STAPE robotlink 拼装失败时回 embed 页，
// 均为猫版 parse:1 嗅探兜底在 XPTV 无嗅探位的降级（urls:[embed URL]）。
// S-VIP 链说明：猫版靠 fetch redirect:'manual' 取 /v/{t} 的 302 Location；$fetch 不暴露跳转后地址/Location，
// XPTV 版改以 $fetch.get 跟跳校验 /v/{t} 返回确为 #EXTM3U 播放列表后，直返 /v/{t} 地址并带 Referer=embed 页头，
// 由播放器请求时自行跟 302 到签名列表（待真机验）。
// 猫版 setTimeout 超时包装按规范去掉，改 $fetch 单通道串行；DSTR 线（DoodStream/Turnstile）猫版即不生成线路，此处同。
const SITE = 'https://javideo.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = SITE + '/';
const JAVIDEO_WORKER = 'https://javideo-vidhide.li768435813.workers.dev';

const CATS = [
  { type_id: 'censored', type_name: 'モザあり' },
  { type_id: 'uncensored-h65gJ931GK', type_name: '無修正' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'engsub-h65gJ931ti', type_name: 'Engsub' },
  { type_id: 'studio/fc2ppv-s2padYt6q8', type_name: 'FC2PPV' },
  { type_id: 'genre/solowork', type_name: '単体作品' },
  { type_id: 'genre/high-quality', type_name: 'ハイビジョン' },
  { type_id: 'genre/creampie', type_name: '中出し' },
  { type_id: 'genre/exclusive', type_name: '独占配信' },
  { type_id: 'genre/amateur', type_name: '素人' },
  { type_id: 'genre/handjob', type_name: '手コキ' },
  { type_id: 'genre/toy', type_name: 'おもちゃ' },
  { type_id: 'genre/69', type_name: 'シックスナイン' },
  { type_id: 'genre/big-tits', type_name: '巨乳' },
  { type_id: 'genre/married-woman', type_name: '人妻・主婦' },
  { type_id: 'genre/4k', type_name: '4K' },
  { type_id: 'genre/milf', type_name: '熟女' },
  { type_id: 'genre/beautiful-girl', type_name: '美少女' },
  { type_id: 'genre/blow', type_name: 'フェラ' },
  { type_id: 'genre/slut', type_name: '痴女' },
  { type_id: 'genre/cuckold', type_name: '寝取り・寝取られ・NTR' },
  { type_id: 'genre/slender', type_name: 'スレンダー' },
  { type_id: 'genre/digimo', type_name: 'デジモ' },
  { type_id: 'genre/3p4p', type_name: '3P・4P' },
  { type_id: 'genre/squirting', type_name: '潮吹き' },
  { type_id: 'genre/nasty-hardcore', type_name: '淫乱・ハード系' },
  { type_id: 'genre/breasts', type_name: '美乳' },
  { type_id: 'genre/4hr', type_name: '4時間以上作品' },
  { type_id: 'genre/titty-fuck', type_name: 'パイズリ' },
  { type_id: 'genre/cowgirl', type_name: '騎乗位' },
  { type_id: 'genre/drama', type_name: 'ドラマ' },
  { type_id: 'genre/pov', type_name: 'ハメ撮り' },
  { type_id: 'genre/cross-dressing', type_name: '妄想族' },
  { type_id: 'genre/school-girls', type_name: '女子校生' },
  { type_id: 'genre/huge-butt', type_name: '巨尻' },
  { type_id: 'genre/affair', type_name: '不倫' },
  { type_id: 'genre/facials', type_name: '顔射' },
  { type_id: 'genre/kiss-kiss', type_name: 'キス・接吻' },
  { type_id: 'genre/older-sister', type_name: 'お姉さん' },
  { type_id: 'genre/acme-%C2%B7-orgasm', type_name: 'アクメ・オーガズム' },
  { type_id: 'genre/shaved', type_name: 'パイパン' },
  { type_id: 'genre/documentary', type_name: 'ドキュメンタリー' },
  { type_id: 'genre/ol', type_name: 'OL' },
  { type_id: 'genre/incest', type_name: '近親相姦' },
  { type_id: 'genre/deep-throating', type_name: 'イラマチオ' },
  { type_id: 'genre/masturbation', type_name: 'オナニー' },
  { type_id: 'genre/uniform', type_name: '制服' },
  { type_id: 'genre/debut-production', type_name: 'デビュー作品' },
  { type_id: 'genre/humiliation', type_name: '羞恥' },
  { type_id: 'genre/cosplay', type_name: 'コスプレ' },
  { type_id: 'genre/cunnilingus', type_name: 'クンニ' },
  { type_id: 'genre/shamed', type_name: '辱め' },
  { type_id: 'genre/butt', type_name: '尻フェチ' },
  { type_id: 'genre/gal', type_name: 'ギャル' },
  { type_id: 'genre/dirty-words', type_name: '淫語' },
  { type_id: 'genre/orgy', type_name: '乱交' },
  { type_id: 'genre/other-fetish', type_name: 'その他フェチ' },
  { type_id: 'genre/risky-mosaic', type_name: 'ギリモザ' },
  { type_id: 'genre/lotion', type_name: 'ローション・オイル' },
  { type_id: 'genre/subjectivity', type_name: '主観' },
  { type_id: 'genre/restraints', type_name: '拘束' },
  { type_id: 'genre/voyeur', type_name: '盗撮・のぞき' },
  { type_id: 'genre/nampa', type_name: 'ナンパ' },
  { type_id: 'genre/female-college-student', type_name: '女子大生' },
  { type_id: 'genre/anal', type_name: 'アナル' },
  { type_id: 'genre/cum', type_name: 'ごっくん' },
  { type_id: 'genre/beauty-shop', type_name: 'エステ' },
  { type_id: 'genre/pantyhose', type_name: 'パンスト・タイツ' },
  { type_id: 'genre/huge-cock', type_name: 'デカチン・巨根' },
  { type_id: 'genre/planning', type_name: '企画' },
  { type_id: 'genre/submissive-men', type_name: 'M男' },
  { type_id: 'genre/sweat', type_name: '汗だく' },
  { type_id: 'genre/female-teacher', type_name: '女教師' },
  { type_id: 'genre/nice-ass', type_name: '美尻' },
  { type_id: 'genre/bakku', type_name: 'バック' },
  { type_id: 'genre/bukkake', type_name: 'ぶっかけ' },
  { type_id: 'genre/miss-customs', type_name: 'キャバ嬢・風俗嬢' },
  { type_id: 'genre/massage', type_name: 'マッサージ・リフレ' },
  { type_id: 'genre/sister', type_name: '姉・妹' },
  { type_id: 'genre/hot-spring', type_name: '温泉' },
  { type_id: 'genre/urination', type_name: '放尿・お漏らし' },
  { type_id: 'genre/anal-sex', type_name: 'アナルセックス' },
  { type_id: 'genre/m-woman', type_name: 'M女' },
  { type_id: 'genre/vibe', type_name: 'バイブ' },
  { type_id: 'genre/tits', type_name: '貧乳・微乳' },
  { type_id: 'genre/busty-fetish', type_name: '巨乳フェチ' },
  { type_id: 'genre/various-professions', type_name: '職業色々' },
  { type_id: 'genre/entertainer', type_name: 'アイドル・芸能人' },
  { type_id: 'genre/emanieru', type_name: 'エマニエル' },
  { type_id: 'genre/bbw', type_name: 'ぽっちゃり' },
  { type_id: 'genre/image-video', type_name: 'イメージビデオ' },
  { type_id: 'genre/sm', type_name: 'SM' },
  { type_id: 'genre/tall', type_name: '長身' },
  { type_id: 'genre/leg-fetish', type_name: '脚フェチ' },
  { type_id: 'genre/mini', type_name: 'ミニ系' },
  { type_id: 'genre/beautiful-legs', type_name: '美脚' },
  { type_id: 'genre/mother', type_name: 'お母さん' },
  { type_id: 'genre/rezubian', type_name: 'レズビアン' },
  { type_id: 'genre/finger-fuck', type_name: '指マン' },
  { type_id: 'genre/virgin-man', type_name: '童貞' },
  { type_id: 'genre/evil', type_name: '鬼畜' },
  { type_id: 'genre/school-uniform', type_name: '学生服' },
  { type_id: 'genre/outdoors', type_name: '野外・露出' },
  { type_id: 'genre/hitodzuma', type_name: '人妻' },
  { type_id: 'genre/bondage', type_name: '縛り・緊縛' },
  { type_id: 'genre/av-idol', type_name: 'AV女優' },
  { type_id: 'genre/ultra-huge-tits', type_name: '超乳' },
  { type_id: 'genre/harem', type_name: 'ハーレム' },
  { type_id: 'genre/electric-massager', type_name: '電マ' },
  { type_id: 'genre/close-up', type_name: '局部アップ' },
  { type_id: 'genre/mother-in-law', type_name: '義母' },
  { type_id: 'genre/underwear', type_name: 'パンチラ' },
  { type_id: 'genre/brideyoung-wife', type_name: '若妻・幼妻' },
  { type_id: 'genre/nurse', type_name: '看護婦・ナース' },
  { type_id: 'genre/transsexual', type_name: 'ニューハーフ' },
  { type_id: 'genre/petite', type_name: '小柄' },
  { type_id: 'genre/drug', type_name: 'ドラッグ' },
  { type_id: 'genre/facesitting', type_name: '顔面騎乗' },
  { type_id: 'genre/female-boss', type_name: '女上司' },
  { type_id: 'genre/kiss', type_name: 'レズキス' },
  { type_id: 'genre/daughter', type_name: '女装・男の娘' },
  { type_id: 'genre/3p-4p', type_name: '3P、4P' },
  { type_id: 'genre/raw-saddle', type_name: '生ハメ' },
  { type_id: 'genre/school-swimsuit', type_name: '競泳・スクール水着' },
  { type_id: 'genre/lingerie', type_name: 'ランジェリー' },
  { type_id: 'genre/bitchi', type_name: 'ビッチ' },
  { type_id: 'genre/swimsuit', type_name: '水着' },
  { type_id: 'genre/original-collaboration', type_name: '原作コラボ' },
  { type_id: 'genre/maid', type_name: 'メイド' },
  { type_id: 'genre/sexy', type_name: 'セクシー' },
  { type_id: 'genre/soapland', type_name: 'ヘルス・ソープ' },
  { type_id: 'genre/footjob', type_name: '足コキ' },
  { type_id: 'genre/bareback', type_name: '生ハメ・生姦' },
  { type_id: 'genre/confinement', type_name: '監禁' },
  { type_id: 'genre/soku-hame', type_name: '即ハメ' },
  { type_id: 'genre/glasses', type_name: 'めがね' },
  { type_id: 'genre/erotic-wear', type_name: '着エロ' },
  { type_id: 'genre/oral-launch', type_name: '口内発射' },
  { type_id: 'genre/kimonomourning', type_name: '和服・浴衣' },
  { type_id: 'genre/sailor-suit', type_name: 'セーラー服' },
  { type_id: 'genre/lesbian', type_name: 'レズ' },
  { type_id: 'genre/mischief', type_name: 'イタズラ' },
  { type_id: 'genre/impregnate', type_name: '孕ませ' },
  { type_id: 'genre/date', type_name: 'デート' },
  { type_id: 'genre/best-omnibus', type_name: '女優ベスト・総集編' },
  { type_id: 'genre/sleeping-sleeping', type_name: '寝取り、寝取られ' },
  { type_id: 'genre/bloomers', type_name: '体操着・ブルマ' },
  { type_id: 'genre/milf', type_name: '熟女/人妻' },
  { type_id: 'genre/actress', type_name: '女優' },
  { type_id: 'genre/multiple-story', type_name: '複数話' },
  { type_id: 'genre/couple', type_name: 'カップル' },
  { type_id: 'genre/ryoojoku', type_name: '凌辱' },
  { type_id: 'genre/enema', type_name: '浣腸' },
  { type_id: 'genre/love', type_name: '恋愛' },
  { type_id: 'genre/bath', type_name: 'お風呂' },
  { type_id: 'genre/fair-skinned', type_name: '色白' },
  { type_id: 'genre/mini-skirt', type_name: 'ミニスカ' },
  { type_id: 'genre/female-investigator', type_name: '女捜査官' },
  { type_id: 'genre/fan-appreciation', type_name: 'ファン感謝・訪問' },
  { type_id: 'genre/male-squirting', type_name: '男の潮吹き' },
  { type_id: 'genre/childhood-friend', type_name: '幼なじみ' },
  { type_id: 'genre/original-video', type_name: 'オリジナル動画' },
  { type_id: 'genre/bunny-girl', type_name: 'バニーガール' },
  { type_id: 'genre/school-stuff', type_name: '学園もの' },
  { type_id: 'genre/subordinates--colleagues', type_name: '部下・同僚' },
  { type_id: 'genre/black-actor', type_name: '黒人男優' },
  { type_id: 'genre/svip', type_name: '超VIP' },
  { type_id: 'genre/dirudo', type_name: 'ディルド' },
  { type_id: 'genre/nasty-hard-system', type_name: '淫乱、ハード系' },
  { type_id: 'genre/hotel', type_name: 'ホテル' },
  { type_id: 'genre/stewardess', type_name: 'スチュワーデス' },
  { type_id: 'genre/torture', type_name: '拷問' },
  { type_id: 'genre/secretary', type_name: '秘書' },
  { type_id: 'genre/business-suit', type_name: 'ビジネススーツ' },
  { type_id: 'genre/tutor', type_name: '家庭教師' },
  { type_id: 'genre/no-bra', type_name: 'ノーブラ' },
  { type_id: 'genre/drinking-party', type_name: '飲み会・合コン' },
  { type_id: 'genre/onasapo', type_name: 'オナサポ' },
  { type_id: 'genre/small-tits', type_name: '微乳' },
  { type_id: 'genre/white-actress', type_name: '白人女優' },
  { type_id: 'genre/user-submission', type_name: '投稿' },
  { type_id: 'genre/reotado', type_name: 'レオタード' },
  { type_id: 'genre/reversed-role', type_name: '逆ナン' },
  { type_id: 'genre/document', type_name: 'ドキュメント' },
  { type_id: 'genre/sport', type_name: 'スポーツ' },
  { type_id: 'genre/oral', type_name: '口内射精' },
  { type_id: 'genre/athlete', type_name: 'アスリート' },
  { type_id: 'genre/sun-tan', type_name: '日焼け' },
  { type_id: 'genre/undead', type_name: '未亡人' },
  { type_id: 'genre/travel', type_name: '旅行' },
  { type_id: 'genre/black-hair', type_name: '黒髪' },
  { type_id: 'genre/aunt', type_name: '叔母さん' },
  { type_id: 'genre/hospital--clinic', type_name: '病院・クリニック' },
  { type_id: 'genre/feranuki', type_name: 'フェラ抜き' },
  { type_id: 'genre/joshi-ana', type_name: '女子アナ' },
  { type_id: 'genre/fantasy', type_name: 'ファンタジー' },
  { type_id: 'genre/piss-drinking', type_name: '飲尿' },
  { type_id: 'genre/30s', type_name: '30代' },
  { type_id: 'genre/rolling-back-eyes--fainting', type_name: '白目・失神' },
  { type_id: 'genre/rooshon', type_name: 'ローション' },
  { type_id: 'genre/delusion', type_name: '妄想' },
  { type_id: 'genre/race-queen', type_name: 'レースクィーン' },
  { type_id: 'genre/foreign-objects', type_name: '異物挿入' },
  { type_id: 'genre/spanking', type_name: 'スパンキング' },
  { type_id: 'genre/rape', type_name: 'レイプ' },
  { type_id: 'genre/shotacon', type_name: 'ショタ' },
  { type_id: 'genre/daughterfoster', type_name: '娘・養女' },
  { type_id: 'genre/female-doctor', type_name: '女医' },
  { type_id: 'genre/pansuto', type_name: 'パンスト' },
  { type_id: 'genre/tosatsu', type_name: '盗撮' },
  { type_id: 'genre/chubby', type_name: 'ポッチャリ' },
  { type_id: 'genre/geinoojin', type_name: '芸能人' },
  { type_id: 'genre/club-activities--manager', type_name: '部活・マネージャー' },
  { type_id: 'genre/breast-milk', type_name: '母乳' },
  { type_id: 'genre/tsundere', type_name: 'ツンデレ' },
  { type_id: 'genre/muscle', type_name: '筋肉' },
  { type_id: 'genre/instructor', type_name: 'インストラクター' },
  { type_id: 'genre/portio', type_name: 'ポルチオ' },
  { type_id: 'genre/tied-up', type_name: '縛り' },
  { type_id: 'genre/besuto-soshuhen', type_name: 'ベスト、総集編' },
  { type_id: 'genre/elder-male', type_name: 'お爺ちゃん' },
  { type_id: 'genre/training', type_name: '調教' },
  { type_id: 'genre/bonteji', type_name: 'ボンテージ' },
  { type_id: 'genre/imooto', type_name: '妹' },
  { type_id: 'genre/rota', type_name: 'ローター' },
  { type_id: 'genre/lori', type_name: 'ロリ' },
  { type_id: 'genre/special-effects', type_name: '特撮' },
  { type_id: 'genre/3p', type_name: '3P' },
  { type_id: 'genre/landlady-hostess', type_name: '女将・女主人' },
  { type_id: 'genre/selfie', type_name: '個人撮影' },
  { type_id: 'genre/loli-system', type_name: 'ロリ系' },
  { type_id: 'genre/dance', type_name: 'ダンス' },
  { type_id: 'genre/car-sex', type_name: 'カーセックス' },
  { type_id: 'genre/model', type_name: 'モデル' },
  { type_id: 'genre/action-fight', type_name: 'アクション格闘' },
  { type_id: 'genre/kusuko', type_name: 'クスコ' },
  { type_id: 'genre/knee-socks', type_name: 'ニーソックス' },
  { type_id: 'genre/for-women', type_name: '女性向け' },
  { type_id: 'genre/young', type_name: 'お嬢様・令嬢' },
  { type_id: 'genre/premature-ejaculation', type_name: '早漏' },
  { type_id: 'genre/miss-manners', type_name: '風俗嬢' },
  { type_id: 'genre/naive', type_name: '初心 (うぶ) 系' },
  { type_id: 'genre/time-stop', type_name: '時間停止' },
  { type_id: 'genre/chest-chiller', type_name: '胸チラ' },
  { type_id: 'genre/akushon', type_name: 'アクション' },
  { type_id: 'genre/yagai', type_name: '野外' },
  { type_id: 'genre/piledriver', type_name: 'マングリ返し' },
  { type_id: 'genre/ghost-animal', type_name: '鬼畜系' },
  { type_id: 'genre/gero', type_name: 'ゲロ' },
  { type_id: 'genre/swapping--couple-exchange', type_name: 'スワッピング・夫婦交換' },
  { type_id: 'genre/affair--cheating', type_name: '不倫・浮気' },
  { type_id: 'genre/pissing', type_name: '放尿' },
  { type_id: 'genre/bride', type_name: '花嫁' },
  { type_id: 'genre/oversea-import', type_name: '洋ピン・海外輸入' },
  { type_id: 'genre/no-undies', type_name: 'ノーパン' },
  { type_id: 'genre/how-to', type_name: 'How To' },
  { type_id: 'genre/anal-sex-cross-dressing-man', type_name: 'アナルセックス（男の娘）' },
  { type_id: 'genre/massaji', type_name: 'マッサージ' },
  { type_id: 'genre/scat', type_name: 'スカトロ' },
  { type_id: 'genre/naked-apron', type_name: '裸エプロン' },
  { type_id: 'genre/nantai', type_name: '軟体' },
  { type_id: 'genre/virgin', type_name: '処女' },
  { type_id: 'genre/defecation', type_name: '脱糞' },
  { type_id: 'genre/nurse', type_name: '看護婦' },
  { type_id: 'genre/cruel-expression', type_name: '残虐表現' },
  { type_id: 'genre/body-conscious', type_name: 'ボディコン' },
  { type_id: 'genre/nose-hook', type_name: '鼻フック' },
  { type_id: 'genre/queen', type_name: '女王様' },
  { type_id: 'genre/kimono', type_name: '浴衣・着物' },
  { type_id: 'genre/rinkan', type_name: '輪姦' },
  { type_id: 'genre/interview', type_name: '面接' },
  { type_id: 'genre/tickling', type_name: 'くすぐり' },
  { type_id: 'genre/mom-friends', type_name: 'ママ友' },
  { type_id: 'genre/fisting', type_name: 'フィスト' },
  { type_id: 'genre/beautiful-woman', type_name: '美女' },
  { type_id: 'genre/other-asian', type_name: 'アジア女優' },
  { type_id: 'genre/rimjob', type_name: 'アナル舐め' },
  { type_id: 'genre/seitenka-jotaika', type_name: '性転換・女体化' },
  { type_id: 'genre/catgirl', type_name: 'ネコミミ・獣系' },
  { type_id: 'genre/masked', type_name: '覆面・マスク' },
  { type_id: 'genre/loose-socks', type_name: 'ルーズソックス' },
  { type_id: 'genre/kimono-mourning', type_name: '和服、喪服' },
  { type_id: 'genre/ai-generated-artwork', type_name: 'AI生成作品' },
  { type_id: 'genre/otaku', type_name: 'オタク' },
  { type_id: 'genre/dark-system', type_name: 'ダーク系' },
  { type_id: 'genre/fighting-action', type_name: 'アクション・格闘' },
  { type_id: 'genre/hanayome-wakadzuma', type_name: '花嫁、若妻' },
  { type_id: 'genre/debut-work', type_name: 'デビュー作' },
  { type_id: 'genre/waitress', type_name: 'ウェイトレス' },
  { type_id: 'genre/yoga', type_name: 'ヨガ' },
  { type_id: 'genre/streaming', type_name: 'ストリーミング対応' },
  { type_id: 'genre/bloomers', type_name: 'ブルマ' },
  { type_id: 'genre/manko-zukan', type_name: 'マンコ図鑑' },
  { type_id: 'genre/20s', type_name: '20代' },
  { type_id: 'genre/grandma', type_name: 'お婆ちゃん' },
  { type_id: 'genre/cheerleader', type_name: 'チアガール' },
  { type_id: 'genre/hard', type_name: 'ハード系' },
  { type_id: 'genre/cleaning-blow', type_name: 'お掃除フェラ' },
  { type_id: 'genre/fetish', type_name: 'フェチ' },
  { type_id: 'genre/40s', type_name: '40代' },
  { type_id: 'genre/knee-high-boots', type_name: 'ロングブーツ' },
  { type_id: 'genre/receptionist', type_name: '受付嬢' },
  { type_id: 'genre/chikan', type_name: '痴漢' },
  { type_id: 'genre/celebrity', type_name: 'セレブ' },
  { type_id: 'genre/candle', type_name: '蝋燭' },
  { type_id: 'genre/gyagu-komedi', type_name: 'ギャグ・コメディ' },
  { type_id: 'genre/princess-story', type_name: '極上泡姫物語' },
  { type_id: 'genre/saimin', type_name: '催眠' },
  { type_id: 'genre/swimsuit-school', type_name: 'スクール水着' },
  { type_id: 'genre/futanari', type_name: 'ふたなり' },
  { type_id: 'genre/seiso', type_name: '清楚' },
  { type_id: 'genre/campaign-girl', type_name: 'キャンギャル' },
  { type_id: 'genre/young-wife', type_name: '若妻' },
  { type_id: 'genre/intercrural-sex', type_name: '素股' },
  { type_id: 'genre/omnibus--omnibus', type_name: '総集編・オムニバス' },
  { type_id: 'genre/china-dress', type_name: 'チャイナドレス' },
  { type_id: 'genre/sophisticated-adult-healing-pavilion', type_name: '洗練された大人のいやし亭' },
  { type_id: 'genre/insult', type_name: '罵倒' },
  { type_id: 'genre/female-soldier', type_name: '女戦士' },
  { type_id: 'genre/fast-pull-out-best', type_name: '早抜きBEST' },
  { type_id: 'genre/friends-with-benefits', type_name: 'セフレ' },
  { type_id: 'genre/%EF%BC%93p', type_name: '３P' },
  { type_id: 'genre/furo', type_name: '風呂' },
  { type_id: 'genre/look-alike', type_name: 'そっくりさん' },
  { type_id: 'genre/pregnant-woman', type_name: '妊婦' },
  { type_id: 'genre/kawaii', type_name: '可愛い' },
  { type_id: 'genre/the-unreleased', type_name: 'THE 未公開' },
  { type_id: 'genre/soap', type_name: 'ソープ' },
  { type_id: 'genre/epuron', type_name: 'エプロン' },
  { type_id: 'genre/debut', type_name: 'Debut' },
  { type_id: 'genre/hattori', type_name: '初撮り' },
  { type_id: 'genre/over-16-hours', type_name: '16時間以上作品' },
  { type_id: 'genre/experience-confession', type_name: '体験告白' },
  { type_id: 'genre/fighter', type_name: '格闘家' },
  { type_id: 'genre/reprint', type_name: '復刻' },
  { type_id: 'genre/clothes', type_name: '着衣' },
  { type_id: 'genre/ntr', type_name: 'NTR' },
  { type_id: 'genre/abandoned', type_name: '放置' },
  { type_id: 'genre/vip', type_name: 'VIP' },
  { type_id: 'genre/nasty', type_name: '淫乱' },
  { type_id: 'genre/shuchi-purei', type_name: '羞恥プレイ' },
  { type_id: 'genre/lady', type_name: 'お嬢様' },
  { type_id: 'genre/model', type_name: 'モデル系' },
  { type_id: 'genre/shave', type_name: '剃毛' },
  { type_id: 'genre/doll', type_name: 'ドール' },
  { type_id: 'genre/big-breasts', type_name: '爆乳' },
  { type_id: 'genre/dod', type_name: '2010年代後半（DOD）' },
  { type_id: 'genre/sf', type_name: 'SF' },
  { type_id: 'genre/brush-down', type_name: '筆おろし' },
  { type_id: 'genre/netorare', type_name: 'ネトラレ' },
  { type_id: 'genre/woman-slutty', type_name: 'この女、ふしだら。' },
  { type_id: 'genre/gay', type_name: 'ゲイ' },
  { type_id: 'genre/beauty', type_name: '美人' },
  { type_id: 'genre/kunoichi', type_name: 'くノ一' },
  { type_id: 'genre/summer-nude', type_name: 'サマーヌード' },
  { type_id: 'genre/yagairode', type_name: '野外露出' },
  { type_id: 'genre/anthology', type_name: 'アンソロジー' },
  { type_id: 'genre/shower', type_name: 'シャワー' },
  { type_id: 'genre/wakai', type_name: '若い' },
  { type_id: 'genre/bus-guide', type_name: 'バスガイド' },
  { type_id: 'genre/irama', type_name: 'イラマ' },
  { type_id: 'genre/sm-restraint', type_name: 'SM拘束' },
  { type_id: 'genre/companion', type_name: 'コンパニオン' },
  { type_id: 'genre/collaborative-work', type_name: 'コラボ作品' },
  { type_id: 'genre/oil-play', type_name: 'オイルプレイ' },
  { type_id: 'genre/g-cup', type_name: 'Gカップ' },
  { type_id: 'genre/drunk', type_name: '泥酔' },
  { type_id: 'genre/being-taken-asleep', type_name: '寝取られ' },
  { type_id: 'genre/actress-soul', type_name: '女優魂' },
  { type_id: 'genre/shokushu', type_name: '触手' },
  { type_id: 'genre/classic', type_name: 'クラシック' },
  { type_id: 'genre/priestess', type_name: '巫女' },
  { type_id: 'genre/50s', type_name: '50代' },
  { type_id: 'genre/cute', type_name: 'かわいい' },
  { type_id: 'genre/3d', type_name: '3D' },
  { type_id: 'genre/coprophagy', type_name: '食糞' },
  { type_id: 'genre/wafuku', type_name: '和服' },
  { type_id: 'genre/outflow', type_name: '流出' },
  { type_id: 'genre/ecstasy', type_name: '恍惚' },
  { type_id: 'genre/boga-x-boga', type_name: 'BOGA x BOGA' },
  { type_id: 'genre/digital-mosaic', type_name: 'Digital Mosaic' },
  { type_id: 'genre/cuckold--cuckold', type_name: '寝取り・寝取られ' },
  { type_id: 'genre/semen', type_name: 'ザーメン' },
  { type_id: 'genre/breaststroke', type_name: '胸射' },
  { type_id: 'genre/naked', type_name: '全裸' },
  { type_id: 'genre/fellatio', type_name: 'フェラチオ' },
  { type_id: 'genre/swallowing', type_name: '精飲' },
  { type_id: 'genre/cleaning-blowjob', type_name: '掃除フェラ' },
  { type_id: 'genre/dainamaito', type_name: 'ダイナマイト' },
  { type_id: 'genre/delivery-health-lady', type_name: 'デリヘル嬢' },
  { type_id: 'genre/belochu', type_name: 'ベロチュー' },
  { type_id: 'genre/f-cup', type_name: 'Fカップ' },
  { type_id: 'genre/baby-face', type_name: '童顔' },
  { type_id: 'genre/jd', type_name: 'JD' },
  { type_id: 'genre/princess', type_name: 'お姫様' },
  { type_id: 'genre/female-hot-continent', type_name: '女熱大陸' },
  { type_id: 'genre/taiwan-model', type_name: '台湾モデル' },
  { type_id: 'genre/shame-humiliation', type_name: '羞恥・辱め' },
  { type_id: 'genre/butterfly', type_name: '蝶が如く' },
  { type_id: 'genre/new-employee-job', type_name: '新入社員のお仕事' },
  { type_id: 'genre/roshutsu', type_name: '露出' },
  { type_id: 'genre/lucky-bag', type_name: '福袋' },
  { type_id: 'genre/landlady', type_name: '女将、女主人' },
  { type_id: 'genre/pillow-business', type_name: '枕営業' },
  { type_id: 'genre/hatsuura', type_name: '初裏' },
  { type_id: 'genre/anaru-zukan', type_name: 'アナル図鑑' },
  { type_id: 'genre/kurokami-rongu', type_name: '黒髪ロング' },
  { type_id: 'genre/sexy-actress-encyclopedia', type_name: 'セクシー女優エンサイクロペディア' },
  { type_id: 'genre/bristle', type_name: '剛毛' },
  { type_id: 'genre/dirty-blame', type_name: '淫語責め' },
  { type_id: 'genre/frustration', type_name: '欲求不満' },
  { type_id: 'genre/henshin-hiroin', type_name: '変身ヒロイン' },
  { type_id: 'genre/chippai', type_name: 'ちっぱい' },
  { type_id: 'genre/horror', type_name: 'ホラー' },
  { type_id: 'genre/promiscuity', type_name: 'Promiscuity' },
  { type_id: 'genre/panties', type_name: 'パンティ' },
  { type_id: 'genre/small-breasts', type_name: '貧乳' },
  { type_id: 'genre/4p', type_name: '４P' },
  { type_id: 'genre/nekomimi', type_name: 'ネコミミ' },
  { type_id: 'genre/sokui', type_name: '側位' },
  { type_id: 'genre/outdoor-sex', type_name: '青姦' },
  { type_id: 'genre/eichikappu', type_name: 'Hカップ' },
  { type_id: 'genre/2-ana-seme', type_name: '2穴責め' },
  { type_id: 'genre/besuto-omunibasu', type_name: 'ベスト/オムニバス' },
  { type_id: 'genre/office', type_name: 'オフィス' },
  { type_id: 'genre/teen-18', type_name: '10代 (18+)' },
];

const appConfig = {
    ver: 1,
    title: 'JAVIDEO',
    site: SITE,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
    return t(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, "'").replace(/&#8211;/g, '-').replace(/&#8212;/g, '-').replace(/&ndash;/g, '-').replace(/&mdash;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
}
function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    return u;
}
async function getText(url, headers, minLen) {
    const h = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'ja,en-US;q=0.8,en;q=0.7', 'Referer': REFERER, ...(headers || {}) };
    const need = minLen || 200;
    try {
        const { data, status } = await $fetch.get(url, { headers: h });
        if ((status === 200 || status === 206 || status === undefined) && data) {
            const txt = typeof data === 'string' ? data : JSON.stringify(data);
            if (txt && txt.length >= need) return txt;
            if (txt && need <= 10 && txt.length >= 1) return txt;
        }
    } catch (e) {}
    return '';
}
async function postJson(url, obj, headers) {
    const h = { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'Referer': REFERER, ...(headers || {}) };
    try {
        const { data, status } = await $fetch.post(url, obj, { headers: h });
        if ((status === undefined || status === 200) && data) {
            if (typeof data === 'string') { try { return JSON.parse(data); } catch (e) { return null; } }
            if (typeof data === 'object') return data;
        }
    } catch (e) {}
    return null;
}
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const parts = String(html || '').split('<div class="card card--big">');
    for (let i = 1; i < parts.length; i++) {
        const chunk = parts[i].slice(0, 3500);
        const linkM = chunk.match(/card__title"><a href="(https:\/\/javideo\.net\/[^"]+)"[^>]*title="([^"]*)"/) || chunk.match(/card__title"><a href="(https:\/\/javideo\.net\/[^"]+)"[^>]*>([^<]*)</);
        if (!linkM) continue;
        const durl = linkM[1];
        const rest = durl.slice(SITE.length + 1);
        if (!rest || rest.includes('/')) continue;
        if (seen.has(durl)) continue;
        seen.add(durl);
        let pic = '';
        const imgM = chunk.match(/data-src="(https:[^"]+)"/) || chunk.match(/<img[^>]+src="(https:[^"]+)"/);
        if (imgM && !/default-cover/.test(imgM[1])) pic = imgM[1];
        const codeM = chunk.match(/card__category"><a[^>]*>([^<]+)</);
        out.push({ vod_id: durl, vod_name: clean(linkM[2]) || durl, vod_pic: fixUrl(pic), vod_remarks: codeM ? clean(codeM[1]) : '', ext: { id: durl } });
    }
    return out;
}
function pagecountOf(html) {
    const nums = [...String(html || '').matchAll(/\/pg-(\d+)/g)].map(x => parseInt(x[1], 10)).filter(n => n > 0 && n < 1000000);
    return nums.length ? Math.max(...nums) : 0;
}
function listUrl(tid, page) { return SITE + '/' + tid + (page > 1 ? '/pg-' + page : ''); }
async function listPageList(tid, page) {
    const html = await getText(listUrl(tid, page));
    return html ? parseCards(html) : [];
}
function infoRow(html, label) {
    const i = html.indexOf(label);
    if (i < 0) return '';
    return html.slice(i, i + 1200);
}
function extractLines(html) {
    const i = html.indexOf('episodeShow');
    const region = i >= 0 ? html.slice(i, i + 4000) : '';
    const found = [];
    for (const m of region.matchAll(/<button data-id="(\d+)"[^>]*>([^<]+)<\/button>/g)) {
        const label = clean(m[2]).toUpperCase();
        let kind = '';
        if (label.startsWith('S-VIP')) kind = 'v';
        else if (label.startsWith('SW')) kind = 'w';
        else if (label.startsWith('LLS')) kind = 'l';
        else if (label.startsWith('STAPE')) kind = 't';
        else continue;
        if (!found.some(f => f.kind === kind)) found.push({ kind, epi: m[1] });
    }
    const order = { v: 0, w: 1, l: 2, t: 3 };
    found.sort((a, b) => order[a.kind] - order[b.kind]);
    return found;
}
const LINE_NAMES = { v: 'S-VIP', w: 'SW', l: 'LLS', t: 'STAPE' };
async function getEmbed(epi, durl) {
    const j = await postJson(SITE + '/api/movie/getPlayer', { id: String(epi) }, { 'Referer': durl || REFERER });
    if (!j) return '';
    const u = t(j.data).replace(/\\\//g, '/');
    return /^https?:\/\//.test(u) ? u : '';
}
async function resolveSvip(embedUrl) {
    let origin = '', uuid = '';
    try {
        const u = new URL(embedUrl);
        origin = u.origin;
        uuid = u.pathname.split('/').filter(Boolean).pop() || '';
    } catch (e) { return null; }
    if (!uuid) return null;
    const tokTxt = await getText(origin + '/api/playlist-token/' + encodeURIComponent(uuid), { 'Accept': 'application/json', 'Referer': embedUrl }, 10);
    let tok = '';
    if (tokTxt) { try { tok = t(JSON.parse(tokTxt).t); } catch (e) {} }
    if (!tok) return null;
    const vUrl = origin + '/v/' + encodeURIComponent(tok);
    // $fetch 跟跳后校验终点确为播放列表；校验失败则信任 token 链、仍直返 /v 地址由播放器跟跳
    const pl = await getText(vUrl, { 'Referer': embedUrl }, 5);
    if (pl && !pl.includes('#EXTM3U')) {
        // 跟跳终点不是列表文本（可能为二进制/空）时仍返回 /v，交播放器处理；仅当明确拿到非列表 HTML 才判负
        if (/<html/i.test(pl)) return null;
    }
    return { url: vUrl, referer: embedUrl };
}
function jsUnescapeSingle(s) {
    return s.replace(/\\(.)/g, (m, c) => {
        if (c === 'n') return '\n';
        if (c === 'r') return '\r';
        if (c === 't') return '\t';
        return c;
    });
}
function unpackDeanEdwards(html) {
    const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
    if (!m) return '';
    let p = jsUnescapeSingle(m[1]);
    const a = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    const k = jsUnescapeSingle(m[4]).split('|');
    const enc = (n) => (n < a ? '' : enc(Math.floor(n / a))) + ((n % a) > 35 ? String.fromCharCode((n % a) + 29) : (n % a).toString(36));
    let i = c;
    while (i--) {
        if (k[i]) {
            const word = k[i];
            p = p.replace(new RegExp('\\b' + enc(i) + '\\b', 'g'), () => word);
        }
    }
    return p;
}
function extractStreamCandidates(html, embedUrl) {
    const text = unpackDeanEdwards(html) || String(html || '');
    const links = {};
    for (const m of text.matchAll(/"hls(\d+)"\s*:\s*"([^"]+)"/g)) links['hls' + m[1]] = m[2];
    const out = [];
    for (const key of ['hls4', 'hls3', 'hls2']) {
        const raw = links[key];
        if (!raw) continue;
        try { const abs = new URL(raw, embedUrl).href; if (!out.includes(abs)) out.push(abs); } catch (e) {}
    }
    if (!out.length) {
        const f = text.match(/"file"\s*:\s*"(https?:[^"]+\.m3u8[^"]*)"/) || text.match(/(https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*)/);
        if (f) { try { out.push(new URL(f[1], embedUrl).href); } catch (e) {} }
    }
    return out;
}
async function resolveVidhideLike(embedUrl, durl) {
    if (JAVIDEO_WORKER) {
        const wurl = JAVIDEO_WORKER + '/v?u=' + encodeURIComponent(embedUrl) + '&r=' + encodeURIComponent(durl || REFERER);
        const txt = await getText(wurl, {}, 20);
        if (txt && txt.includes('#EXTM3U')) {
            return { urls: [wurl], headers: [{ 'User-Agent': UA, 'Referer': REFERER }] };
        }
    }
    const html = await getText(embedUrl, { 'Referer': durl || REFERER }, 1000);
    if (html) {
        const cands = extractStreamCandidates(html, embedUrl);
        for (const c of cands) {
            const pl = await getText(c, { 'Referer': embedUrl }, 5);
            if (pl && pl.includes('#EXTM3U')) {
                return { urls: [c], headers: [{ 'User-Agent': UA, 'Referer': embedUrl }] };
            }
        }
        if (cands.length) return { urls: [cands[0]], headers: [{ 'User-Agent': UA, 'Referer': embedUrl }] };
    }
    return { urls: [embedUrl], headers: [{ 'User-Agent': UA, 'Referer': durl || REFERER }] };
}
function resolveRobotlink(html) {
    const s = String(html || '');
    for (const el of ['robotlink', 'botlink', 'ideoolink']) {
        const re = new RegExp("getElementById\\('" + el + "'\\)\\.innerHTML\\s*=\\s*'([^']*)'\\s*(?:\\+\\s*\\(\\s*'([^']*)'\\s*\\)\\s*((?:\\.substring\\(\\d+\\))*))?");
        const m = s.match(re);
        if (!m) continue;
        let out = m[1];
        if (m[2]) {
            let d = m[2];
            for (const sm of m[3].matchAll(/\.substring\((\d+)\)/g)) d = d.substring(parseInt(sm[1], 10));
            out += d;
        }
        out = out.replace(/^\/\//, 'https://').replace(/^\//, 'https:/');
        if (/get_video\?/.test(out)) return out;
    }
    return '';
}
async function resolveStape(embedUrl, durl) {
    const html = await getText(embedUrl, { 'Referer': durl || REFERER }, 1000);
    if (html) {
        const link = resolveRobotlink(html);
        if (link) return { urls: [link], headers: [{ 'User-Agent': UA, 'Referer': embedUrl }] };
    }
    return { urls: [embedUrl], headers: [{ 'User-Agent': UA, 'Referer': durl || REFERER }] };
}
function normKw(wd) {
    return t(wd).toLowerCase().replace(/[\s\.:;=+]+/g, '-').replace(/-+-/g, '-').replace(/^-+|-+$/g, '');
}

async function getConfig() { return jsonify(appConfig); }

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || 'censored';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = CATS.find(c => c.type_id === tid);
    if (!cat) return jsonify({ list: [] });
    return jsonify({ list: await listPageList(cat.type_id, page) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//.test(id) ? id : SITE + '/' + id.replace(/^\//, '');
    const html = await getText(durl);
    if (!html) return jsonify({ list: [] });
    const lines = extractLines(html);
    if (!lines.length) {
        return jsonify({ list: [{ title: '无可用线路', tracks: [{ name: '正片', pan: '', ext: { id: 'x:0:' + durl, flag: '无可用线路' } }] }] });
    }
    const list = lines.map(ln => ({
        title: LINE_NAMES[ln.kind],
        tracks: [{ name: '正片', pan: '', ext: { id: ln.kind + ':' + ln.epi + ':' + durl, flag: LINE_NAMES[ln.kind] } }],
    }));
    return jsonify({ list });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.startsWith('正片$')) id = id.slice(3);
    const p1 = id.indexOf(':');
    const p2 = p1 >= 0 ? id.indexOf(':', p1 + 1) : -1;
    if (p1 < 0 || p2 < 0) return jsonify({ urls: [], headers: [] });
    const kind = id.slice(0, p1);
    const epi = id.slice(p1 + 1, p2);
    const durl = id.slice(p2 + 1);
    if (!epi || epi === '0') return jsonify({ urls: [], headers: [] });
    if (kind === 'v' || kind === 'w' || kind === 'l' || kind === 't') {
        const embed = await getEmbed(epi, durl);
        if (!embed) return jsonify({ urls: [], headers: [] });
        if (kind === 'v') {
            const r = await resolveSvip(embed);
            if (r) return jsonify({ urls: [r.url], headers: [{ 'User-Agent': UA, 'Referer': r.referer }] });
            return jsonify({ urls: [], headers: [] });
        }
        if (kind === 'w' || kind === 'l') return jsonify(await resolveVidhideLike(embed, durl));
        return jsonify(await resolveStape(embed, durl));
    }
    return jsonify({ urls: [], headers: [] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const kw = normKw(wd);
    if (!kw) return jsonify({ list: [] });
    return jsonify({ list: await listPageList('search/' + encodeURIComponent(kw), page) });
}
