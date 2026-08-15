export type StoryHistoryEntry = {
  nodeTitle: string;
  choiceLabel: string;
  result: string;
};

export type StoryState = {
  currentStoryNodeId: string;
  storyFlags: string[];
  storyHistory: StoryHistoryEntry[];
  completedEndings: string[];
  storyCycle: number;
  relationship: number;
};

type StoryEffect = {
  experience?: number;
  coins?: number;
  relationship?: number;
  addFlags?: string[];
  rewardItemId?: string;
};

export type StoryChoice = {
  id: string;
  label: string;
  nextId: string;
  outcome: string;
  note: string;
  effect?: StoryEffect;
  condition?: (game: StoryState) => boolean;
  lockedText?: string;
};

export type StoryNode = {
  id: string;
  chapter: string;
  title: string;
  location: string;
  season: string;
  quest: string;
  image?: string;
  imageAlt?: string;
  choices: StoryChoice[];
  endingName?: string;
};

export type StoryResolution = {
  nextNodeId: string;
  narrative: string;
  note: string;
  experience: number;
  coins: number;
  relationship: number;
  flags: string[];
  rewardItemId?: string;
  lastChange: string;
  historyEntry: StoryHistoryEntry;
  endingName?: string;
};

const node = (value: StoryNode) => value;

export const storyNodes: Record<string, StoryNode> = {
  notting_street: node({
    id: "notting_street", chapter: "第一章 · 雨后异痕", title: "发光的脚印", location: "诺丁城", season: "三月·午后", quest: "查清雨后脚印的来源", choices: [
      { id: "chase", label: "顺着脚印追上去", nextId: "narrow_alley", outcome: "你追进窄巷。一个背着旧布包的少年停住脚步，把沾着草叶的手藏到身后，却没有逃。", note: "少年正在寻找能压制魂力反噬的月纹草。", effect: { experience: 70, relationship: 2, addFlags: ["追踪脚印"] } },
      { id: "academy", label: "先回学院报到", nextId: "academy_gate", outcome: "你来到学院门前。门房扣着工读生的推荐信不肯放行，小舞抱臂站在一旁，显然很不耐烦。", note: "门房似乎在故意刁难持有正规推荐信的工读生。", effect: { experience: 55, addFlags: ["按时报到"] } },
      { id: "observe", label: "留在原地观察", nextId: "hooded_shadow", outcome: "你隐在屋檐下等候。一个兜帽人从侧巷离开，袖口落下一枚会自行卷曲的蓝银草籽。", note: "兜帽人带走了某件东西，却留下异常草籽。", effect: { experience: 45, addFlags: ["谨慎观察", "取得异变草籽"] } },
    ],
  }),
  narrow_alley: node({
    id: "narrow_alley", chapter: "第一章 · 雨后异痕", title: "窄巷里的药草", location: "诺丁城东巷", season: "三月·申时", quest: "决定如何处理陌生少年的秘密", choices: [
      { id: "help", label: "帮他寻找月纹草", nextId: "notting_night", outcome: "你找到月纹草。少年坦言药是为受伤的工读生准备的，并给你一枚药草园铜牌。入夜后，学院钟楼响起第三声钟。", note: "你获得了进入药草园的凭证。", effect: { experience: 90, relationship: 5, addFlags: ["帮助工读生", "药草园通行"], rewardItemId: "healing_herb" } },
      { id: "question", label: "追问蓝光的来历", nextId: "notting_night", outcome: "少年承认有人用药草园做魂力实验。他说出暗号后离开，入夜时三声钟响果然从学院深处传来。", note: "交货暗号是“三声钟响，旧井见”。", effect: { experience: 110, addFlags: ["掌握暗号"] } },
      { id: "hand_over", label: "夺下布包交给学院", nextId: "notting_night", outcome: "学院执事收走布包，给了你六枚金魂币。工读生宿舍却有人旧伤复发，小舞看你的眼神冷了下来。", note: "执事收走证物，却没有登记去向。", effect: { experience: 60, coins: 6, relationship: -5, addFlags: ["服从执事", "药草被没收"] } },
    ],
  }),
  academy_gate: node({
    id: "academy_gate", chapter: "第一章 · 雨后异痕", title: "被扣下的推荐信", location: "诺丁初级魂师学院", season: "三月·申时", quest: "处理学院门前的争执", choices: [
      { id: "speak", label: "替工读生据理力争", nextId: "notting_night", outcome: "你指出推荐信上的正式印记，门房只能放行。小舞记住了你的名字，入夜后来找你调查三声怪钟。", note: "小舞愿意与你共同调查学院异动。", effect: { experience: 75, relationship: 6, addFlags: ["工读生盟友"] } },
      { id: "master", label: "请大师查验推荐信", nextId: "notting_night", outcome: "大师让门房退开，又提醒你不要靠近旧井。入夜后，旧井方向传来与你在街上感到的相同魂力。", note: "大师知道旧井有问题，却暂时不愿说明。", effect: { experience: 100, relationship: 1, addFlags: ["大师提醒"] } },
      { id: "pay", label: "付钱息事宁人", nextId: "notting_night", outcome: "两枚金魂币让门房换了笑脸。你顺利入学，却错过工读生的信任。入夜后，有人正向三声钟响起的旧井赶去。", note: "你避开了冲突，但没有获得任何人的帮助。", effect: { experience: 50, coins: -2, addFlags: ["独自入学"] } },
    ],
  }),
  hooded_shadow: node({
    id: "hooded_shadow", chapter: "第一章 · 雨后异痕", title: "兜帽人的背影", location: "诺丁城西市", season: "三月·傍晚", quest: "追查异变蓝银草籽", choices: [
      { id: "follow", label: "保持距离跟踪", nextId: "notting_night", outcome: "兜帽人进入学院药草园。你记下守卫换岗的空隙，第三声钟响时已经站在旧井附近。", note: "药草园西墙每半个时辰会出现守卫空隙。", effect: { experience: 95, addFlags: ["掌握换岗"] } },
      { id: "study", label: "研究落下的草籽", nextId: "notting_night", outcome: "你的魂力唤醒草籽，其中显出被强行拼接的兽魂气息。三声钟响后，草籽朝学院旧井弯折。", note: "异变草籽能感应同源魂力。", effect: { experience: 120, addFlags: ["识破兽魂实验"] } },
      { id: "warn", label: "立刻回学院示警", nextId: "notting_night", outcome: "执事收下草籽，却要求你不要声张。入夜后三声钟响，证物已经消失，学院内部显然有人接应。", note: "学院执事中可能藏着实验同谋。", effect: { experience: 65, relationship: 2, addFlags: ["怀疑执事", "证物失踪"] } },
    ],
  }),
  notting_night: node({
    id: "notting_night", chapter: "第一章 · 雨后异痕", title: "第三声钟响", location: "诺丁学院旧井", season: "三月·子夜", quest: "在旧井封闭前取得关键线索", choices: [
      { id: "enter", label: "潜入旧井密道", nextId: "departure", outcome: "密道尽头只剩搬空的石台。你从火中抢下一页账册，上面反复出现“史莱克”和“星斗样本”。", note: "残页指向史莱克学院与星斗大森林。", effect: { experience: 140, addFlags: ["取得实验残页"] } },
      { id: "rescue", label: "先救被困的工读生", nextId: "departure", outcome: "你救出两名被当作魂力容器的工读生，幕后之人趁乱撤走。小舞问出了“史莱克接头人”这条线索。", note: "获救者见过接头人的绿色怪物徽章。", effect: { experience: 115, relationship: 8, addFlags: ["救出工读生", "小舞同行"] } },
      { id: "ambush", label: "守在出口伏击主谋", nextId: "departure", outcome: "你截住运送样本的魂师。对方逃脱前丢下星斗商队通行证，追踪方向由此变得清晰。", note: "通行证能避开部分沿途盘查。", effect: { experience: 125, coins: 4, addFlags: ["截获通行证"] } },
    ],
  }),
  departure: node({
    id: "departure", chapter: "第二章 · 离城之路", title: "三条远行路线", location: "诺丁城南门", season: "四月·清晨", quest: "选择追查实验线索的路线", image: "/game-assets/world-map.png", imageAlt: "斗罗大陆旅行地图", choices: [
      { id: "forest", label: "直赴星斗大森林", nextId: "forest_edge", outcome: "你沿猎魂小径赶往星斗大森林。越靠近林缘，蓝银草越是不安，仿佛有陌生力量在地下呼吸。", note: "森林外围出现人为布置的兽魂诱捕阵。", effect: { experience: 80, addFlags: ["森林路线"] } },
      { id: "caravan", label: "随商队前往索托城", nextId: "caravan_ambush", outcome: "你加入南下商队。第三天黄昏，蒙面魂师封住峡谷，要求交出车队里从星斗森林运出的黑箱。", note: "黑箱传出与异变草籽相同的魂力频率。", effect: { experience: 60, addFlags: ["商队路线"] } },
      { id: "shrek", label: "持线索拜访史莱克", nextId: "shrek_gate", outcome: "你提前抵达史莱克。线索上的绿色徽记与招生牌背面的刻痕相同，戴沐白已经注意到你手中的证物。", note: "有人借用了史莱克废弃的旧徽。", effect: { experience: 70, addFlags: ["学院路线"] }, condition: (game) => game.storyFlags.includes("取得实验残页") || game.storyFlags.includes("救出工读生"), lockedText: "需要实验残页或工读生口供" },
    ],
  }),
  forest_edge: node({
    id: "forest_edge", chapter: "第二章 · 离城之路", title: "诱捕阵中的幼兽", location: "星斗大森林外围", season: "四月·雨夜", quest: "处理被实验组织诱捕的魂兽", image: "/game-assets/world-map.png", imageAlt: "星斗大森林所在区域地图", choices: [
      { id: "free", label: "破阵放走幼兽", nextId: "shrek_gate", outcome: "你拆掉诱捕阵。幼兽离开前碰了碰你的手背，赶到史莱克时，奥斯卡认出你沾染的月影兽气息。", note: "森林魂兽的善意成为伙伴信任你的理由。", effect: { experience: 145, relationship: 5, addFlags: ["魂兽善意", "团队信任"] } },
      { id: "track", label: "利用诱捕阵反向追踪", nextId: "shrek_gate", outcome: "你追到撤空的营地，只带回一枚七宝琉璃宗制式封箱扣。宁荣荣一眼认出它是仿造品。", note: "有人故意把实验嫁祸给七宝琉璃宗。", effect: { experience: 165, relationship: 3, addFlags: ["识破嫁祸", "荣荣知情"] } },
      { id: "absorb", label: "吸收阵中残余魂力", nextId: "shrek_gate", outcome: "你吸收诱捕阵的魂力，修为迅速增长，狂乱兽性却在经脉里留下痕迹。", note: "力量增长明显，后续控制难度也随之上升。", effect: { experience: 280, relationship: -3, addFlags: ["吸收禁制魂力", "力量倾向"] } },
    ],
  }),
  caravan_ambush: node({
    id: "caravan_ambush", chapter: "第二章 · 离城之路", title: "峡谷截车", location: "索托城北峡谷", season: "四月·黄昏", quest: "保住商队并查明黑箱来历", choices: [
      { id: "fight", label: "正面击退蒙面魂师", nextId: "shrek_gate", outcome: "你守在车前击退敌人，黑箱却在交战中破裂。奥斯卡认出箱内是用来麻痹魂兽的浓缩药粉。", note: "实验组织正在大量捕捉活体魂兽。", effect: { experience: 180, relationship: 3, addFlags: ["正面迎战"] } },
      { id: "deal", label: "假意交箱套取情报", nextId: "shrek_gate", outcome: "你用空箱换来接头暗语，再夺回货物。戴沐白证实暗语属于一名被史莱克除名的旧学员。", note: "幕后主谋熟悉史莱克内部制度。", effect: { experience: 140, coins: 5, relationship: 2, addFlags: ["掌握接头暗语"] } },
      { id: "protect", label: "优先护送平民撤离", nextId: "shrek_gate", outcome: "你放弃追敌，先送车夫与家眷离开。黑箱被抢走，商队主人却把完整运货账本交给了你。", note: "账本足以追查实验组织的资金来源。", effect: { experience: 120, relationship: 6, addFlags: ["护送平民", "取得运输账本"] } },
    ],
  }),
  shrek_gate: node({
    id: "shrek_gate", chapter: "第三章 · 怪物同盟", title: "史莱克的门槛", location: "史莱克学院", season: "五月·正午", quest: "取得史莱克众人的信任", choices: [
      { id: "duel", label: "接受戴沐白的试探", nextId: "shrek_trial", outcome: "你与戴沐白交手十招，没有退开一步。他认可你的胆量，也提醒真正的敌人会利用每一分贪念。", note: "戴沐白愿意在试炼中与你互相照应。", effect: { experience: 190, relationship: 5, addFlags: ["团队信任"] } },
      { id: "evidence", label: "公开一路收集的证据", nextId: "shrek_trial", outcome: "你把线索铺满桌面。众人理清资金流与药粉配方，第一次看见这张横跨数城的网。", note: "证据链初步形成，团队调查正式开始。", effect: { experience: 130, relationship: 7, addFlags: ["公开证据", "团队信任"] } },
      { id: "hide", label: "暂时隐瞒关键线索", nextId: "shrek_trial", outcome: "你只交出无关紧要的线索，把真正的底牌留在手里。众人允许你参加试炼，却没有放下戒心。", note: "隐藏线索可用于独自交易，也会损伤团队信任。", effect: { experience: 110, coins: 3, relationship: -4, addFlags: ["保留底牌", "力量倾向"] } },
    ],
  }),
  shrek_trial: node({
    id: "shrek_trial", chapter: "第三章 · 怪物同盟", title: "镜林团队试炼", location: "史莱克镜林", season: "五月·夜", quest: "选择试炼中的合作方式", choices: [
      { id: "front", label: "与小舞突破正面", nextId: "academy_crisis", outcome: "你和小舞击碎镜阵核心，却发现与诺丁旧井相同的魂力导管。内应已经把实验搬进学院。", note: "小舞能证明导管来自真实实验。", effect: { experience: 210, relationship: 7, addFlags: ["团队羁绊", "小舞见证"] } },
      { id: "support", label: "保护两位辅助魂师", nextId: "academy_crisis", outcome: "奥斯卡找出空气中的麻痹药，宁荣荣用琉璃光标出地下魂力管线，众人找到了秘密入口。", note: "辅助魂师掌握了破解地下实验室的关键。", effect: { experience: 175, relationship: 8, addFlags: ["团队羁绊", "发现地下入口"] } },
      { id: "solo", label: "脱离队伍独自夺旗", nextId: "academy_crisis", outcome: "你第一个夺旗，也撞见藏在终点后的实验人员。对方用力量换取沉默，并透露大斗魂场即将举行特殊决赛。", note: "你收到秘密交易邀请，队友并不知道全部真相。", effect: { experience: 260, relationship: -6, addFlags: ["收到交易邀请", "力量倾向"] } },
    ],
  }),
  academy_crisis: node({
    id: "academy_crisis", chapter: "第四章 · 暗潮决断", title: "同夜三封密信", location: "史莱克学院", season: "六月·暴雨前", quest: "选择终结实验组织的突破口", choices: [
      { id: "lab", label: "连夜潜入地下实验室", nextId: "underground_lab", outcome: "你沿镜林管线进入地底。魂力容器围绕人造魂核运转，主谋正准备转移全部记录。", note: "摧毁魂核能停止实验，也会毁掉部分证据。", effect: { experience: 90, addFlags: ["潜入实验室"] } },
      { id: "arena", label: "参加大斗魂场特殊决赛", nextId: "tournament_final", outcome: "你们以参赛者身份进入大斗魂场。决赛奖品正是人造魂核，观众席坐满等待交易的各方势力。", note: "赢下决赛可公开控制魂核与买家名单。", effect: { experience: 100, addFlags: ["公开赛场"] } },
      { id: "offer", label: "赴约见神秘交易人", nextId: "spirit_offer", outcome: "你独自来到旧教堂。交易人提出用魂核技术、金魂币与地位交换你手中的证据。", note: "接受交易能快速变强，受害者却将无法讨回公道。", effect: { experience: 70, addFlags: ["秘密赴约"] }, condition: (game) => game.storyFlags.includes("收到交易邀请") || game.storyFlags.includes("保留底牌"), lockedText: "需要秘密交易邀请或保留关键线索" },
    ],
  }),
  underground_lab: node({
    id: "underground_lab", chapter: "第四章 · 暗潮决断", title: "人造魂核", location: "史莱克地下实验室", season: "六月·黎明前", quest: "决定受害者、证据与力量的优先顺序", choices: [
      { id: "save", label: "先释放所有魂力容器", nextId: "final_crossroads", outcome: "你切断导管，让被抽取魂力的人与魂兽先行撤离。主谋带走半份名册，却没能带走任何活体样本。", note: "所有受害者获救，但证据链不再完整。", effect: { experience: 170, relationship: 9, addFlags: ["救出全部样本", "守护倾向"] } },
      { id: "records", label: "封锁出口夺取完整名册", nextId: "final_crossroads", outcome: "你顶住魂核过载，抢下完整名册与资金记录。这份证据足以让幕后势力无法翻身。", note: "你掌握了公开指控整个组织的完整证据。", effect: { experience: 240, relationship: 4, addFlags: ["完整证据链"] } },
      { id: "core", label: "吸收人造魂核", nextId: "final_crossroads", outcome: "你把人造魂核纳入经脉，暴涨的魂力压垮大厅。主谋趁乱逃走，队友也第一次真正畏惧你的道路。", note: "你获得危险力量，实验组织仍可能复起。", effect: { experience: 520, relationship: -10, addFlags: ["掌控人造魂核", "力量倾向"] } },
    ],
  }),
  tournament_final: node({
    id: "tournament_final", chapter: "第四章 · 暗潮决断", title: "万人注视的决赛", location: "索托大斗魂场", season: "六月·夜", quest: "在公开决赛中控制人造魂核", choices: [
      { id: "win", label: "全力夺冠控制魂核", nextId: "final_crossroads", outcome: "你以实力赢下决赛，当众夺得人造魂核。买家交易被迫中止，主谋却趁庆典混入人群。", note: "你获得公开声望与魂核控制权。", effect: { experience: 300, coins: 12, relationship: 3, addFlags: ["斗魂冠军", "掌控人造魂核"] } },
      { id: "protect", label: "保护队友并揭露作弊", nextId: "final_crossroads", outcome: "你放弃最后一击，挡住针对辅助魂师的暗器。买家名单同时投上光幕，整座会场哗然。", note: "队伍完整，交易名单已向公众曝光。", effect: { experience: 210, relationship: 10, addFlags: ["名单公开", "团队羁绊", "守护倾向"] } },
      { id: "swap", label: "用假魂核调包真品", nextId: "final_crossroads", outcome: "你让买家带走空壳。真正的魂核留在手中，却没有人能证明今晚发生过交易。", note: "你保住力量，却失去公开追责的机会。", effect: { experience: 250, coins: 8, relationship: -3, addFlags: ["掌控人造魂核", "力量倾向"] } },
    ],
  }),
  spirit_offer: node({
    id: "spirit_offer", chapter: "第四章 · 暗潮决断", title: "旧教堂的价码", location: "索托城旧教堂", season: "六月·午夜", quest: "回应神秘交易人的最终报价", choices: [
      { id: "refuse", label: "拒绝并留下交易证据", nextId: "final_crossroads", outcome: "你用留声石记录整场谈话，在对方动手前离开。队友虽不满你的独自行动，仍愿完成最后指控。", note: "交易录音补上了主谋身份这块拼图。", effect: { experience: 180, relationship: 5, addFlags: ["完整证据链", "拒绝交易"] } },
      { id: "accept", label: "交出证据换取魂核", nextId: "final_crossroads", outcome: "你烧掉证据，换得完整魂核与一袋金魂币。力量从未如此接近，同伴也已经知道你做了什么。", note: "证据消失，你与同伴的关系出现裂痕。", effect: { experience: 480, coins: 30, relationship: -15, addFlags: ["掌控人造魂核", "接受交易", "力量倾向"] } },
      { id: "trap", label: "假意成交，引同伴包围", nextId: "final_crossroads", outcome: "你拖延到约定信号出现，伙伴们从四面封住教堂。交易人被迫交出魂核与名册。", note: "主谋落网，证据、魂核与同伴都得以保全。", effect: { experience: 260, relationship: 10, addFlags: ["完整证据链", "团队羁绊", "主谋落网"] }, condition: (game) => game.storyFlags.includes("团队羁绊"), lockedText: "需要在团队试炼中建立羁绊" },
    ],
  }),
  final_crossroads: node({
    id: "final_crossroads", chapter: "终章 · 命运回响", title: "黎明前的选择", location: "索托城中央广场", season: "六月·黎明", quest: "为这条时间线写下结局", image: "/game-assets/world-map.png", imageAlt: "即将迎来新格局的斗罗大陆", choices: [
      { id: "expose", label: "公开证据，守护受害者", nextId: "ending_guardian", outcome: "你把证据交给所有愿意作证的人。实验组织在阳光下瓦解，多年后，人们称你为不受权位左右的守望者。", note: "结局已记录：大陆守望者。", effect: { experience: 300, relationship: 8, addFlags: ["结局·大陆守望者"] }, condition: (game) => game.storyFlags.includes("完整证据链") || game.storyFlags.includes("名单公开"), lockedText: "需要完整证据链或公开的买家名单" },
      { id: "alliance", label: "与伙伴共同保管真相", nextId: "ending_alliance", outcome: "你把力量与证据分散交给最信任的伙伴。史莱克成为守望各地异常的同盟，你们的名字从此总在同一页出现。", note: "结局已记录：怪物同盟。", effect: { experience: 260, relationship: 12, addFlags: ["结局·怪物同盟"] }, condition: (game) => game.storyFlags.includes("团队羁绊") && game.relationship >= 45, lockedText: "需要团队羁绊且伙伴好感达到 45" },
      { id: "power", label: "掌控魂核，建立自己的秩序", nextId: "ending_power", outcome: "你用人造魂核跨过原本需要数年才能触及的门槛。旧组织消失，一个以你意志为中心的新秩序开始生长。", note: "结局已记录：魂核君临者。", effect: { experience: 600, addFlags: ["结局·魂核君临者"] }, condition: (game) => game.storyFlags.includes("掌控人造魂核") && game.storyFlags.includes("力量倾向"), lockedText: "需要掌控人造魂核并持续选择力量道路" },
      { id: "leave", label: "带着线索离开权力中心", nextId: "ending_wanderer", outcome: "你拒绝成为任何势力的旗帜，把未解线索装进行囊，独自踏上更远的路。星斗森林深处仍有魂力回应你。", note: "结局已记录：自由行者。", effect: { experience: 220, addFlags: ["结局·自由行者"] } },
    ],
  }),
  ending_guardian: node({ id: "ending_guardian", chapter: "结局", title: "大陆守望者", location: "新的时代", season: "多年以后", quest: "这条时间线已经完成", choices: [], endingName: "大陆守望者" }),
  ending_alliance: node({ id: "ending_alliance", chapter: "结局", title: "怪物同盟", location: "史莱克学院", season: "多年以后", quest: "这条时间线已经完成", choices: [], endingName: "怪物同盟" }),
  ending_power: node({ id: "ending_power", chapter: "结局", title: "魂核君临者", location: "大陆中心", season: "多年以后", quest: "这条时间线已经完成", choices: [], endingName: "魂核君临者" }),
  ending_wanderer: node({ id: "ending_wanderer", chapter: "结局", title: "自由行者", location: "星斗大森林深处", season: "新的旅程", quest: "这条时间线已经完成", choices: [], endingName: "自由行者" }),
};

export function getStoryNode(game: StoryState) {
  return storyNodes[game.currentStoryNodeId] ?? storyNodes.notting_street;
}

export function resolveStoryChoice(game: StoryState, choiceId: string, customAction?: string): StoryResolution | null {
  const currentNode = getStoryNode(game);
  const choice = currentNode.choices.find((item) => item.id === choiceId);
  if (!choice || (choice.condition && !choice.condition(game))) return null;
  const nextNode = storyNodes[choice.nextId];
  if (!nextNode) return null;
  const effect = choice.effect ?? {};
  const choiceLabel = customAction ? `自由行动：${customAction}` : choice.label;
  const changes = [
    effect.experience ? `魂力经验 +${effect.experience}` : "",
    effect.coins ? `金魂币 ${effect.coins > 0 ? "+" : ""}${effect.coins}` : "",
    effect.relationship ? `伙伴好感 ${effect.relationship > 0 ? "+" : ""}${effect.relationship}` : "",
    effect.rewardItemId ? "获得剧情奖励" : "",
  ].filter(Boolean);
  return {
    nextNodeId: nextNode.id,
    narrative: customAction ? `你选择“${customAction}”，用自己的方式推动局势。${choice.outcome}` : choice.outcome,
    note: choice.note,
    experience: effect.experience ?? 0,
    coins: effect.coins ?? 0,
    relationship: effect.relationship ?? 0,
    flags: [...new Set([...game.storyFlags, ...(effect.addFlags ?? [])])],
    rewardItemId: effect.rewardItemId,
    lastChange: changes.join(" · ") || "命运标记已更新",
    historyEntry: { nodeTitle: currentNode.title, choiceLabel, result: choice.note },
    endingName: nextNode.endingName,
  };
}

export function getDefaultCustomChoice(game: StoryState) {
  const node = getStoryNode(game);
  return node.choices.find((choice) => !choice.condition || choice.condition(game)) ?? null;
}
