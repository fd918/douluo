import { CANON_ENDINGS, CANON_START_NODE_ID, canonStoryNodes } from "./canonStory.ts";

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
  name?: string;
  martialSoul?: string;
  identity?: string;
  talent?: string;
  storyMode?: "canon" | "legacy";
  narrativePace?: "immersive" | "standard" | "fast";
  originPlace?: string;
  background?: string;
  lifeGoal?: string;
  secret?: string;
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
  intro?: string;
  canonAnchor?: string;
  sceneIndex?: number;
  sceneCount?: number;
  timelineNote?: string;
  dialogue?: Array<{ speaker: string; text: string }>;
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

export const ALL_ENDINGS = [
  "大陆守望者",
  "怪物同盟",
  "魂核君临者",
  "自由行者",
  "瀚海守望者",
  "史莱克星辉",
  "蓝银裁决者",
  "潮汐远行者",
  ...CANON_ENDINGS,
] as const;

export function buildSceneBridge(currentNode: StoryNode, nextNode: StoryNode) {
  if (nextNode.choices.length === 0) return "";
  if (currentNode.chapter !== nextNode.chapter) {
    return `命运，没有给你喘息的时间。${nextNode.season}，你抵达${nextNode.location}。故事，也翻开了新的篇章——${nextNode.chapter}。而“${nextNode.title}”，就此展开。摆在你面前的，是${nextNode.quest}。`;
  }
  if (currentNode.location !== nextNode.location) {
    return `局势仍在向前。${nextNode.season}，你转入${nextNode.location}。“${nextNode.title}”，随之展开。接下来，你必须${nextNode.quest}。`;
  }
  return `余波尚未散去，新的局面已经逼近。“${nextNode.title}”，随之展开。此刻，你必须${nextNode.quest}。`;
}

const legacyStoryNodes: Record<string, StoryNode> = {
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
  ending_guardian: node({
    id: "ending_guardian", chapter: "第五章 · 大陆守望者", title: "阳光下的余波", location: "索托城", season: "盛夏", quest: "回应来自天斗城的新委托", endingName: "大陆守望者", choices: [
      { id: "answer_call", label: "接受天斗城的秘密委托", nextId: "heaven_dou_letter", outcome: "实验组织虽然瓦解，残存的魂力装置却沿商路流入天斗城。你与伙伴收下新委托，第二卷旅程由此开始。", note: "新篇章已开启：天斗暗潮与瀚海航路。", effect: { experience: 160, relationship: 5, addFlags: ["第二卷·天斗来函", "守望者声望"] } },
    ],
  }),
  ending_alliance: node({
    id: "ending_alliance", chapter: "第五章 · 怪物同盟", title: "同一页上的名字", location: "史莱克学院", season: "盛夏", quest: "与伙伴共同调查天斗来函", endingName: "怪物同盟", choices: [
      { id: "travel_together", label: "与伙伴一同前往天斗城", nextId: "heaven_dou_letter", outcome: "史莱克收到一封没有署名的急件：落日森林出现被人为催化的千年魂兽。你们决定以小队身份北上。", note: "团队将共同面对第二卷的全部试炼。", effect: { experience: 150, relationship: 8, addFlags: ["第二卷·天斗来函", "团队远征"] } },
    ],
  }),
  ending_power: node({
    id: "ending_power", chapter: "第五章 · 魂核君临者", title: "力量留下的回声", location: "大陆中心", season: "盛夏", quest: "追踪与人造魂核共鸣的远海晶石", endingName: "魂核君临者", choices: [
      { id: "follow_resonance", label: "循魂核共鸣进入天斗暗市", nextId: "shadow_market", outcome: "人造魂核在午夜自行发亮，指向一块来自远海的深蓝晶石。你独自踏入天斗暗市，那里有人正等待持核者。", note: "力量路线已延伸至天斗暗市。", effect: { experience: 220, relationship: -2, addFlags: ["第二卷·魂核共鸣", "魂核随行", "力量倾向"] } },
    ],
  }),
  ending_wanderer: node({
    id: "ending_wanderer", chapter: "第五章 · 自由行者", title: "森林深处的呼唤", location: "星斗大森林深处", season: "长夏", quest: "回应蓝银草根系传来的古老讯息", endingName: "自由行者", choices: [
      { id: "listen_to_forest", label: "追随蓝银根系的指引", nextId: "forest_oracle", outcome: "越过无人涉足的湿地后，你发现一株被黑色魂力侵蚀的蓝银古种。它的根系指向落日森林，也指向更遥远的西海。", note: "自由路线发现了第二卷最早的自然线索。", effect: { experience: 180, addFlags: ["第二卷·蓝银呼唤", "蓝银古种"] } },
    ],
  }),

  forest_oracle: node({
    id: "forest_oracle", chapter: "第六章 · 天斗暗潮", title: "蓝银古种的低语", location: "星斗大森林深处", season: "七月·晨雾", quest: "决定如何处理被侵蚀的蓝银古种", choices: [
      { id: "purify_seed", label: "以自身魂力净化古种", nextId: "sunset_hunt", outcome: "你的蓝银草与古种根系连接，黑色魂力被一点点排出。古种回赠一枚落日森林的根系坐标。", note: "你获得自然魂兽的信任，并锁定千年鬼藤活动区域。", effect: { experience: 240, relationship: 4, addFlags: ["魂兽盟约", "落日根系坐标", "守护倾向"] } },
      { id: "trace_corruption", label: "保留侵蚀力量反向追踪", nextId: "shadow_market", outcome: "你封存一缕黑色魂力，让它带路。气息最终停在天斗暗市的一间远海货栈前。", note: "侵蚀源头与天斗暗市的远海货物有关。", effect: { experience: 280, coins: 6, addFlags: ["远海黑市线索", "力量倾向"] } },
      { id: "call_allies", label: "召集史莱克伙伴共同处理", nextId: "heaven_dou_letter", outcome: "伙伴们赶到后分工封锁根系、记录魂力与照顾附近魂兽。一封来自天斗城的急件也在此时送达。", note: "团队以完整证据回应了天斗城的求援。", effect: { experience: 210, relationship: 9, addFlags: ["团队远征", "团队羁绊", "蓝银古种"] } },
    ],
  }),
  heaven_dou_letter: node({
    id: "heaven_dou_letter", chapter: "第六章 · 天斗暗潮", title: "没有署名的皇家急件", location: "天斗城南驿", season: "七月·黄昏", quest: "查明落日森林魂兽异变与精英赛邀请的关系", image: "/game-assets/world-map.png", imageAlt: "通往天斗城与落日森林的大陆地图", choices: [
      { id: "accept_warrant", label: "以调查员身份接受委托", nextId: "sunset_hunt", outcome: "你取得皇家通行证，可合法进入被封锁的落日森林。急件附页显示，已有三支魂师队在同一区域失踪。", note: "皇家通行证能避开巡逻，也会让你的行动受到关注。", effect: { experience: 170, coins: 8, addFlags: ["皇家通行证", "追查失踪魂师"] } },
      { id: "investigate_market", label: "先查远海货栈与暗市", nextId: "shadow_market", outcome: "你绕开接待官，跟随货运印记进入地下暗市。那里正在拍卖能催化魂兽年限的深海魂晶。", note: "深海魂晶可能是落日森林异变的直接原因。", effect: { experience: 200, addFlags: ["远海黑市线索"] } },
      { id: "seek_seven_treasure", label: "请宁荣荣核验邀请真伪", nextId: "tournament_qualifier", outcome: "宁荣荣发现急件使用了两套相互矛盾的皇家印章。你们决定将计就计，以精英赛参赛队身份进入核心区域。", note: "七宝担保让小队提前获得精英赛资格。", effect: { experience: 190, relationship: 7, addFlags: ["七宝担保", "团队远征", "识破伪造急件"] } },
    ],
  }),
  shadow_market: node({
    id: "shadow_market", chapter: "第六章 · 天斗暗潮", title: "地下暗市的蓝色拍品", location: "天斗城地下暗市", season: "七月·午夜", quest: "取得深海魂晶与货运名单", choices: [
      { id: "expose_auction", label: "联合巡查队封锁拍卖场", nextId: "sunset_hunt", outcome: "你当众揭开魂晶用途，暗市买家四散逃离。货运名单显示下一批魂晶将送往落日森林。", note: "黑市账本成为指控幕后势力的新证据。", effect: { experience: 260, relationship: 5, addFlags: ["黑市账本", "守护倾向"] } },
      { id: "buy_crystal", label: "买下魂晶研究其力量", nextId: "sunset_hunt", outcome: "你用高价买下深海魂晶。它与人造魂核产生危险共鸣，也在表面投出半幅航海星图。", note: "你保留了一块可强化魂力、也可能反噬的深海魂晶。", effect: { experience: 340, coins: -12, relationship: -3, addFlags: ["深海魂晶", "瀚海残图", "力量倾向"], rewardItemId: "sea_crystal" } },
      { id: "steal_manifest", label: "伪装买家调包货运名单", nextId: "tournament_qualifier", outcome: "奥斯卡制造骚动，你用空卷轴换走货运名单。名单最后一栏写着“精英赛冠军船队”。", note: "精英赛冠军奖励与远海航路存在秘密关联。", effect: { experience: 300, relationship: 6, addFlags: ["瀚海残图", "货运名单", "团队羁绊"] } },
    ],
  }),
  sunset_hunt: node({
    id: "sunset_hunt", chapter: "第七章 · 千年魂环", title: "落日森林的三道魂迹", location: "落日森林", season: "八月·雷雨", quest: "选择适合自己的第二魂环道路", choices: [
      { id: "ghost_vine", label: "挑战暴走的千年鬼藤", nextId: "second_ring_awakened", outcome: "鬼藤在深海魂晶影响下狂化。你以蓝银缠绕控制其核心，在它彻底失控前完成吸收。", note: "获得第二魂环：一千三百年鬼藤环，强化控制与破甲。", effect: { experience: 520, addFlags: ["魂环·千年鬼藤", "第二魂环已吸收"], rewardItemId: "millennium_essence" } },
      { id: "moon_vine", label: "守护受伤的千年月藤", nextId: "second_ring_awakened", outcome: "你替月藤挡住追猎者。它主动分出一枚无损魂环，银白藤蔓在你的蓝银草上留下月纹。", note: "获得第二魂环：一千一百年月藤环，强化恢复与束缚。", effect: { experience: 440, relationship: 8, addFlags: ["魂环·千年月藤", "第二魂环已吸收", "魂兽盟约", "守护倾向"] } },
      { id: "purify_vine", label: "净化被魂晶污染的青藤王", nextId: "second_ring_awakened", outcome: "你没有急着猎杀，而是先拔除青藤王体内的魂晶碎屑。它认可你的意志，留下深青色魂环。", note: "获得第二魂环：一千五百年青藤王环，强化范围控制。", effect: { experience: 500, relationship: 5, addFlags: ["魂环·千年青藤王", "第二魂环已吸收", "净化魂晶"] } },
    ],
  }),
  second_ring_awakened: node({
    id: "second_ring_awakened", chapter: "第七章 · 千年魂环", title: "第二魂技初鸣", location: "落日森林营地", season: "八月·黎明", quest: "稳定第二魂环并决定精英赛战术", choices: [
      { id: "team_drill", label: "与伙伴进行团队魂技演练", nextId: "tournament_qualifier", outcome: "你的第二魂技第一次覆盖整片训练场。小舞负责诱敌，戴沐白破阵，辅助魂力在藤网中精准流转。", note: "团队掌握了以蓝银囚笼为核心的控制战术。", effect: { experience: 300, relationship: 9, addFlags: ["蓝银囚笼", "团队战术"], rewardItemId: "tournament_badge" } },
      { id: "solo_mastery", label: "独自压缩魂环力量", nextId: "tournament_qualifier", outcome: "你把范围魂技压成一道锋利藤索，单体爆发大幅提升，但经脉也承受了更重压力。", note: "第二魂技获得力量分支，团队配合略有下降。", effect: { experience: 410, relationship: -3, addFlags: ["蓝银囚笼", "魂技·裁决藤", "力量倾向"] } },
      { id: "healing_mastery", label: "研究魂环的生命共鸣", nextId: "tournament_qualifier", outcome: "你发现蓝银根系可以把恢复力量传给同伴。奥斯卡据此改良了补给，队伍续航显著提升。", note: "第二魂技获得守护分支，可在关键时刻保护全队。", effect: { experience: 350, relationship: 7, addFlags: ["蓝银囚笼", "魂技·生命藤网", "守护倾向"] } },
    ],
  }),
  tournament_qualifier: node({
    id: "tournament_qualifier", chapter: "第八章 · 精英赛风云", title: "天斗预选赛的暗号", location: "天斗大斗魂场", season: "九月·正午", quest: "在预选赛中追查伪装成参赛队的魂晶买家", choices: [
      { id: "win_clean", label: "以团队战术堂堂正正取胜", nextId: "championship_night", outcome: "蓝银囚笼封锁全场，伙伴们依次完成破阵。你们赢得观众认可，也迫使暗中观察的买家改变交易计划。", note: "史莱克以完整阵容进入冠军夜。", effect: { experience: 480, relationship: 10, addFlags: ["精英赛连胜", "团队战术", "史莱克声望"] } },
      { id: "follow_signal", label: "故意露出破绽追踪暗号", nextId: "championship_night", outcome: "你让对方误以为魂晶生效，随后跟踪场边暗号，找到藏在冠军奖杯底座里的半枚航海罗盘。", note: "瀚海航路的关键罗盘已被找到一半。", effect: { experience: 430, coins: 10, addFlags: ["半枚瀚海罗盘", "瀚海残图"] } },
      { id: "overwhelm", label: "释放魂核力量碾压赛场", nextId: "championship_night", outcome: "人造魂核与第二魂环同时震动，对手瞬间失去反抗能力。胜利令人畏惧，也让幕后买家主动向你递来邀请。", note: "你以绝对力量进入冠军夜，并得到秘密交易席位。", effect: { experience: 620, relationship: -8, addFlags: ["魂核赛场", "力量倾向", "冠军交易席"] }, condition: (game) => game.storyFlags.includes("魂核随行") || game.storyFlags.includes("深海魂晶"), lockedText: "需要携带人造魂核或深海魂晶" },
    ],
  }),
  championship_night: node({
    id: "championship_night", chapter: "第八章 · 精英赛风云", title: "冠军夜与失控魂晶", location: "天斗大斗魂场", season: "九月·夜", quest: "阻止冠军庆典下方的魂晶共鸣阵", choices: [
      { id: "save_crowd", label: "先疏散观众再封印魂阵", nextId: "vast_sea_map", outcome: "你用藤网搭起安全通道，伙伴们分散保护看台。共鸣阵最终被封，主谋却带走另一半罗盘。", note: "所有观众安全撤离，你获得公开支持。", effect: { experience: 420, relationship: 11, addFlags: ["万人获救", "守护倾向", "公开声望"] } },
      { id: "take_compass", label: "抢先夺取完整瀚海罗盘", nextId: "vast_sea_map", outcome: "你穿过失控魂力直抵阵眼，在主谋撤离前夺下完整罗盘。赛场受损，却没人能再隐藏远海航路。", note: "完整瀚海罗盘到手，可定位海神岛外围航线。", effect: { experience: 560, coins: 15, addFlags: ["完整瀚海罗盘", "获得瀚海航图"] } },
      { id: "share_power", label: "让伙伴共同承受魂阵压力", nextId: "vast_sea_map", outcome: "五道魂力同时落入阵眼。你们没有任何一人倒下，宁荣荣从破碎光纹中还原了完整航图。", note: "团队共同解开航图，羁绊达到新的阶段。", effect: { experience: 500, relationship: 12, addFlags: ["完整瀚海罗盘", "获得瀚海航图", "史莱克同心"] }, condition: (game) => game.storyFlags.includes("团队战术") || game.relationship >= 55, lockedText: "需要团队战术或伙伴好感达到 55" },
    ],
  }),
  vast_sea_map: node({
    id: "vast_sea_map", chapter: "第九章 · 瀚海航路", title: "罗盘指向西海", location: "天斗城观星塔", season: "十月·星夜", quest: "补全航图并选择远海同行者", image: "/game-assets/world-map.png", imageAlt: "从天斗城通往西海的航路地图", choices: [
      { id: "decode_stars", label: "用观星记录补全航图", nextId: "sea_route", outcome: "罗盘与星轨重合，失落航线逐段显现。你在终点标记旁看见海神岛三个古老字样。", note: "安全航路已经解锁，海神岛可在世界地图前往。", effect: { experience: 360, addFlags: ["获得瀚海航图", "星轨航路"], rewardItemId: "vast_sea_chart" } },
      { id: "rescue_navigator", label: "救出被追杀的远海领航员", nextId: "sea_route", outcome: "你在城外截住追兵，救下唯一走过这条航路的领航员。她愿以真实潮汐记录换取同行保护。", note: "领航员加入船队，暴风海域的风险降低。", effect: { experience: 420, relationship: 7, addFlags: ["获得瀚海航图", "远海领航员", "守护倾向"], rewardItemId: "vast_sea_chart" } },
      { id: "seize_fleet", label: "接管暗市留下的魂导船", nextId: "sea_route", outcome: "你控制了装备魂晶炮的快船，并迫使原船员交出航海日志。强大的船队服从于你，却不真正信任你。", note: "获得高速魂导船与完整航线，力量路线继续加深。", effect: { experience: 520, coins: 20, relationship: -6, addFlags: ["获得瀚海航图", "魂导快船", "力量倾向"], rewardItemId: "vast_sea_chart" } },
    ],
  }),
  sea_route: node({
    id: "sea_route", chapter: "第九章 · 瀚海航路", title: "暴风海峡的选择", location: "西海暴风海峡", season: "十月·风暴", quest: "带领船队穿过魂兽与雷暴共存的海峡", choices: [
      { id: "follow_tide", label: "相信领航员绕行潮眼", nextId: "sea_god_shore", outcome: "船队贴着潮眼边缘穿行，数次与巨浪擦肩而过。黎明时，海神岛的轮廓终于从雾中升起。", note: "船队完整抵达，补给与伙伴状态良好。", effect: { experience: 430, relationship: 8, addFlags: ["完整船队", "潮汐经验"] }, condition: (game) => game.storyFlags.includes("远海领航员") || game.storyFlags.includes("星轨航路"), lockedText: "需要领航员或星轨航路" },
      { id: "protect_beast", label: "救助被魂晶困住的海魂兽", nextId: "sea_god_shore", outcome: "你潜入浪下切断魂晶锁链。获救海魂兽托起船尾，带领所有船只越过最危险的礁群。", note: "海魂兽承认你的善意，岛上守卫也看见了这一幕。", effect: { experience: 500, relationship: 7, addFlags: ["海魂兽盟约", "守护倾向", "完整船队"] } },
      { id: "break_storm", label: "以魂核力量正面撕开风暴", nextId: "sea_god_shore", outcome: "蓝银藤网缠住桅杆，人造魂核化作贯穿乌云的光柱。船队以最快速度冲出风暴，也惊动了深海中的强大存在。", note: "你证明了力量，却让深海试炼提前苏醒。", effect: { experience: 650, relationship: -4, addFlags: ["撕裂风暴", "深海注视", "力量倾向"] }, condition: (game) => game.storyFlags.includes("魂核随行") || game.storyFlags.includes("魂导快船"), lockedText: "需要魂核力量或魂导快船" },
    ],
  }),
  sea_god_shore: node({
    id: "sea_god_shore", chapter: "第十章 · 海神岛", title: "潮汐石阶前的誓言", location: "海神岛", season: "十一月·初晴", quest: "选择接受海岛试炼的方式", choices: [
      { id: "guardian_oath", label: "以守护船队为誓接受试炼", nextId: "tidal_trial", outcome: "潮汐石阶亮起温和蓝光，你的每一段守护经历都化为阶梯。岛上守卫允许整支队伍共同进入。", note: "守护试炼开启，伙伴可在危急时互相援助。", effect: { experience: 520, relationship: 10, addFlags: ["海岛试炼·守护", "海神岛认可"] } },
      { id: "team_oath", label: "与伙伴共同立下同进退誓言", nextId: "tidal_trial", outcome: "五只手同时按在潮汐石上，光纹沿着彼此魂力连接。试炼不再考验一个人，而是考验整个团队。", note: "同心试炼开启，团队结局条件已经具备。", effect: { experience: 500, relationship: 14, addFlags: ["海岛试炼·同心", "史莱克同心", "海神岛认可"] }, condition: (game) => game.relationship >= 60, lockedText: "需要伙伴好感达到 60" },
      { id: "power_oath", label: "以征服深海为誓接受试炼", nextId: "tidal_trial", outcome: "潮汐石骤然下沉，深海压力全部压向你一人。你没有退后，海面因此出现一条只属于强者的黑色阶梯。", note: "征服试炼开启，最终力量将伴随更高代价。", effect: { experience: 720, relationship: -8, addFlags: ["海岛试炼·征服", "力量倾向", "海神岛认可"] } },
    ],
  }),
  tidal_trial: node({
    id: "tidal_trial", chapter: "第十章 · 海神岛", title: "九重潮汐与深海幻境", location: "海神岛潮汐禁地", season: "十一月·月夜", quest: "在幻境中决定力量、伙伴与自由的顺序", choices: [
      { id: "hold_line", label: "留在最后守住所有人的退路", nextId: "deep_sea_crossroads", outcome: "九重潮汐一次次冲垮藤网，你又一次次将它重新织起。伙伴全部通过时，你才踏上最后一级石阶。", note: "无人被留在幻境，守护道路达到极致。", effect: { experience: 680, relationship: 15, addFlags: ["九重潮汐通过", "无人掉队", "守护倾向"] } },
      { id: "link_souls", label: "连接所有人的魂力共同破境", nextId: "deep_sea_crossroads", outcome: "蓝银根系把五种魂力织成一张网。幻境无法再逐个击破你们，整片潮海被共同意志照亮。", note: "团队以完整状态通过最终幻境。", effect: { experience: 650, relationship: 16, addFlags: ["九重潮汐通过", "史莱克同心", "团队传奇"] }, condition: (game) => game.storyFlags.includes("海岛试炼·同心") || game.storyFlags.includes("团队战术"), lockedText: "需要同心试炼或团队战术" },
      { id: "take_source", label: "夺取幻境深处的潮汐本源", nextId: "deep_sea_crossroads", outcome: "你无视幻境中的退路，把潮汐本源收入魂核。深海在一瞬间安静，伙伴却被隔在越来越远的岸上。", note: "你掌控潮汐本源，力量道路已不可逆转。", effect: { experience: 900, relationship: -15, addFlags: ["掌控潮汐本源", "力量倾向"] } },
      { id: "walk_away", label: "放弃神赐力量保留自由", nextId: "deep_sea_crossroads", outcome: "你在最后一级石阶前转身，不让任何试炼替自己定义未来。潮汐没有惩罚你，反而在脚下让出一条通往远方的路。", note: "你拒绝力量与称号，保留了继续远行的自由。", effect: { experience: 480, relationship: 5, addFlags: ["拒绝神赐", "自由之路"] } },
    ],
  }),
  deep_sea_crossroads: node({
    id: "deep_sea_crossroads", chapter: "终章 · 潮汐命运", title: "海天交界的最终选择", location: "海神岛最高海崖", season: "十二月·日出", quest: "为横跨大陆与远海的时间线写下最终结局", image: "/game-assets/world-map.png", imageAlt: "海神岛与斗罗大陆相连的最终航路", choices: [
      { id: "sea_guardian", label: "建立守护大陆与海疆的巡航同盟", nextId: "ending_sea_guardian", outcome: "你把航图、魂晶净化方法与海魂兽盟约公开给可信之人。多年后，每艘平安归来的船都记得最初守望者的名字。", note: "结局已记录：瀚海守望者。", effect: { experience: 900, relationship: 12, addFlags: ["结局·瀚海守望者"] }, condition: (game) => game.storyFlags.includes("守护倾向") && (game.storyFlags.includes("海魂兽盟约") || game.storyFlags.includes("无人掉队")), lockedText: "需要守护道路及海魂兽盟约或无人掉队" },
      { id: "shrek_legend", label: "与伙伴把远征写进史莱克传承", nextId: "ending_shrek_starlight", outcome: "你们把每场失败、争执与胜利留给后来者。史莱克不再只是一所学院，而成为彼此照亮的星图。", note: "结局已记录：史莱克星辉。", effect: { experience: 850, relationship: 18, addFlags: ["结局·史莱克星辉"] }, condition: (game) => game.storyFlags.includes("史莱克同心") && game.relationship >= 70, lockedText: "需要史莱克同心且伙伴好感达到 70" },
      { id: "blue_silver_judge", label: "融合魂核与潮汐本源裁定新秩序", nextId: "ending_blue_silver_judge", outcome: "蓝银根系越过陆地与海床，所有危险魂晶都在你的意志下熄灭。和平因此到来，也再无人能够制衡你的裁决。", note: "结局已记录：蓝银裁决者。", effect: { experience: 1200, addFlags: ["结局·蓝银裁决者"] }, condition: (game) => game.storyFlags.includes("掌控潮汐本源") && game.storyFlags.includes("力量倾向"), lockedText: "需要掌控潮汐本源并坚持力量道路" },
      { id: "tide_wanderer", label: "把罗盘交给后来者，继续驶向未知", nextId: "ending_tide_wanderer", outcome: "你没有留下王座或称号，只把安全航图交给下一批远行者。新大陆的晨光在船首出现，而你的故事仍未结束。", note: "结局已记录：潮汐远行者。", effect: { experience: 720, relationship: 6, addFlags: ["结局·潮汐远行者"] } },
    ],
  }),
  ending_sea_guardian: node({ id: "ending_sea_guardian", chapter: "最终结局", title: "瀚海守望者", location: "大陆与海疆", season: "许多年后", quest: "这条史诗时间线已经完成", choices: [], endingName: "瀚海守望者" }),
  ending_shrek_starlight: node({ id: "ending_shrek_starlight", chapter: "最终结局", title: "史莱克星辉", location: "史莱克学院", season: "许多年后", quest: "这条史诗时间线已经完成", choices: [], endingName: "史莱克星辉" }),
  ending_blue_silver_judge: node({ id: "ending_blue_silver_judge", chapter: "最终结局", title: "蓝银裁决者", location: "海天王座", season: "新纪元", quest: "这条史诗时间线已经完成", choices: [], endingName: "蓝银裁决者" }),
  ending_tide_wanderer: node({ id: "ending_tide_wanderer", chapter: "最终结局", title: "潮汐远行者", location: "未知海域", season: "下一次日出", quest: "这条史诗时间线已经完成", choices: [], endingName: "潮汐远行者" }),
};

export const storyNodes: Record<string, StoryNode> = {
  ...legacyStoryNodes,
  ...canonStoryNodes,
};

export { CANON_SCENE_COUNT, CANON_START_NODE_ID } from "./canonStory.ts";

export function formatStoryText(text: string, game: StoryState) {
  const replacements: Record<string, string> = {
    name: game.name?.trim() || "无名",
    martialSoul: game.martialSoul || "尚未觉醒的武魂",
    identity: game.identity || "原创角色",
    talent: game.talent || "普通档",
    originPlace: game.originPlace || "法斯诺行省边缘村落",
    background: game.background || "普通家庭",
    lifeGoal: game.lifeGoal || "找到属于自己的道路",
    secret: game.secret || "尚未向任何人说出的心事",
  };
  return text.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => replacements[key] ?? placeholder);
}

function applyNarrativePace(text: string, pace: StoryState["narrativePace"]) {
  if (pace !== "fast") return text;
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return paragraphs.length <= 2 ? text : `${paragraphs[0]}\n\n${paragraphs.at(-1)}`;
}

export function getStoryIntro(game: StoryState) {
  const node = getStoryNode(game);
  const intro = node.intro ?? buildSceneBridge(node, node);
  return applyNarrativePace(formatStoryText(intro, game), game.narrativePace);
}

export function getStoryNode(game: StoryState) {
  return storyNodes[game.currentStoryNodeId]
    ?? (game.storyMode === "canon" ? storyNodes[CANON_START_NODE_ID] : storyNodes.notting_street);
}

export function resolveStoryChoice(game: StoryState, choiceId: string, customAction?: string): StoryResolution | null {
  const currentNode = getStoryNode(game);
  const choice = currentNode.choices.find((item) => item.id === choiceId);
  if (!choice || (choice.condition && !choice.condition(game))) return null;
  const nextNode = storyNodes[choice.nextId];
  if (!nextNode) return null;
  const effect = choice.effect ?? {};
  const formattedChoice = formatStoryText(choice.label, game);
  const choiceLabel = customAction ? `自由行动：${customAction}` : formattedChoice;
  const formattedOutcome = formatStoryText(choice.outcome, game);
  const outcome = customAction ? `你选择“${customAction}”，用自己的方式推动局势。${formattedOutcome}` : formattedOutcome;
  const bridge = nextNode.intro
    ? applyNarrativePace(formatStoryText(nextNode.intro, game), game.narrativePace)
    : buildSceneBridge(currentNode, nextNode);
  const changes = [
    effect.experience ? `魂力经验 +${effect.experience}` : "",
    effect.coins ? `金魂币 ${effect.coins > 0 ? "+" : ""}${effect.coins}` : "",
    effect.relationship ? `伙伴好感 ${effect.relationship > 0 ? "+" : ""}${effect.relationship}` : "",
    effect.rewardItemId ? "获得剧情奖励" : "",
  ].filter(Boolean);
  return {
    nextNodeId: nextNode.id,
    narrative: bridge ? `${outcome}\n\n${bridge}` : outcome,
    note: formatStoryText(choice.note, game),
    experience: effect.experience ?? 0,
    coins: effect.coins ?? 0,
    relationship: effect.relationship ?? 0,
    flags: [...new Set([...game.storyFlags, ...(effect.addFlags ?? [])])],
    rewardItemId: effect.rewardItemId,
    lastChange: changes.join(" · ") || "命运标记已更新",
    historyEntry: { nodeTitle: currentNode.title, choiceLabel, result: formatStoryText(choice.note, game) },
    endingName: nextNode.endingName,
  };
}

export function getDefaultCustomChoice(game: StoryState) {
  const node = getStoryNode(game);
  return node.choices.find((choice) => !choice.condition || choice.condition(game)) ?? null;
}
