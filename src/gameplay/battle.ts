import type {
  BattleEvent,
  BattleStartOptions,
  BattleState,
  CombatActionDefinition,
  CombatantState,
  RuleErrorCode,
  RuleResult,
  SoulAttribute,
  StatusEffect,
} from "./types";

function success<T>(value: T): RuleResult<T> {
  return { ok: true, value };
}

function failure<T>(code: RuleErrorCode, message: string): RuleResult<T> {
  return { ok: false, code, message };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function nextRandom(seed: number): { seed: number; value: number } {
  let next = seed | 0;
  if (next === 0) next = 0x6d2b79f5;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return { seed: next >>> 0, value: (next >>> 0) / 4_294_967_296 };
}

function cloneCombatant(combatant: CombatantState): CombatantState {
  return {
    ...combatant,
    stats: { ...combatant.stats },
    statuses: combatant.statuses.map((status) => ({ ...status })),
    actions: combatant.actions.map((action) => ({
      ...action,
      effects: action.effects?.map((effect) => ({ ...effect })),
    })),
  };
}

function normalizeCombatant(
  value: BattleStartOptions["player"] | BattleStartOptions["enemy"],
): CombatantState {
  const maxHp = Math.max(1, Math.floor(value.stats.maxHp));
  const maxEnergy = Math.max(0, Math.floor(value.maxEnergy));
  return {
    ...value,
    stats: {
      maxHp,
      attack: Math.max(0, Math.floor(value.stats.attack)),
      defense: Math.max(0, Math.floor(value.stats.defense)),
      speed: Math.max(0, Math.floor(value.stats.speed)),
      control: Math.max(0, Math.floor(value.stats.control)),
    },
    hp: clamp(Math.floor(value.hp ?? maxHp), 1, maxHp),
    energy: clamp(Math.floor(value.energy ?? maxEnergy), 0, maxEnergy),
    maxEnergy,
    statuses: (value.statuses ?? []).filter((status) => status.remainingTurns > 0).map((status) => ({ ...status })),
    actions: value.actions.map((action) => ({ ...action, effects: action.effects?.map((effect) => ({ ...effect })) })),
  };
}

export function startBattle(options: BattleStartOptions): BattleState {
  return {
    id: options.id,
    seed: options.seed >>> 0,
    round: 1,
    status: "active",
    player: normalizeCombatant(options.player),
    enemy: normalizeCombatant(options.enemy),
    reward: {
      ...options.reward,
      id: options.reward.id ?? `battle:${options.id}`,
      coins: Math.max(0, Math.floor(options.reward.coins)),
      soulExperience: Math.max(0, Math.floor(options.reward.soulExperience)),
      items: Object.fromEntries(
        Object.entries(options.reward.items).filter(([, quantity]) => Number.isSafeInteger(quantity) && quantity > 0),
      ),
    },
    rewardClaimed: false,
    events: [],
  };
}

export function attributeMultiplier(attacker: SoulAttribute, defender: SoulAttribute) {
  if (attacker === "无" || defender === "无" || attacker === "兽" || defender === "兽") return 1;
  if (
    (attacker === "植物" && defender === "水") ||
    (attacker === "水" && defender === "火") ||
    (attacker === "火" && defender === "植物")
  ) return 1.35;
  if (
    (attacker === "水" && defender === "植物") ||
    (attacker === "火" && defender === "水") ||
    (attacker === "植物" && defender === "火")
  ) return 0.75;
  return 1;
}

function statusPotency(actor: CombatantState, kind: StatusEffect["kind"]) {
  return actor.statuses
    .filter((status) => status.kind === kind)
    .reduce((total, status) => total + Math.max(0, status.potency), 0);
}

function effectiveAttack(actor: CombatantState) {
  return Math.max(1, actor.stats.attack - statusPotency(actor, "虚弱"));
}

function effectiveDefense(actor: CombatantState) {
  return Math.max(0, actor.stats.defense + statusPotency(actor, "护盾"));
}

function effectiveSpeed(actor: CombatantState) {
  return Math.max(0, actor.stats.speed - statusPotency(actor, "迟缓"));
}

function resolveTurnStart(
  actor: CombatantState,
  round: number,
): { actor: CombatantState; skipped: boolean; events: BattleEvent[] } {
  let hp = actor.hp;
  let skipped = false;
  const events: BattleEvent[] = [];
  const statuses: StatusEffect[] = [];
  for (const status of actor.statuses) {
    if (status.kind === "中毒" || status.kind === "灼烧") {
      const damage = Math.max(1, Math.floor(status.potency));
      hp = Math.max(0, hp - damage);
      events.push({ round, actorId: actor.id, kind: "damage", amount: damage, text: `${actor.name}受到${status.kind}影响，损失 ${damage} 点生命。` });
    } else if (status.kind === "再生") {
      const healing = Math.min(actor.stats.maxHp - hp, Math.max(1, Math.floor(status.potency)));
      hp += healing;
      if (healing > 0) events.push({ round, actorId: actor.id, kind: "heal", amount: healing, text: `${actor.name}恢复 ${healing} 点生命。` });
    } else if (status.kind === "眩晕") {
      skipped = true;
    }
    if (status.remainingTurns > 1) statuses.push({ ...status, remainingTurns: status.remainingTurns - 1 });
  }
  if (skipped && hp > 0) events.push({ round, actorId: actor.id, kind: "skip", text: `${actor.name}被控制，本轮无法行动。` });
  return { actor: { ...actor, hp, statuses }, skipped, events };
}

function addStatus(actor: CombatantState, status: StatusEffect) {
  const existing = actor.statuses.findIndex((item) => item.id === status.id);
  const statuses = [...actor.statuses];
  if (existing >= 0) {
    statuses[existing] = {
      ...status,
      remainingTurns: Math.max(status.remainingTurns, statuses[existing].remainingTurns),
      potency: Math.max(status.potency, statuses[existing].potency),
    };
  } else {
    statuses.push(status);
  }
  return { ...actor, statuses };
}

function performAction(
  actor: CombatantState,
  target: CombatantState,
  action: CombatActionDefinition,
  round: number,
  seed: number,
): { actor: CombatantState; target: CombatantState; seed: number; events: BattleEvent[] } {
  let nextActor = { ...actor, energy: actor.energy - action.energyCost };
  let nextTarget = target;
  let nextSeed = seed;
  const events: BattleEvent[] = [];
  if (action.kind === "basic") nextActor.energy = Math.min(actor.maxEnergy, nextActor.energy + 1);

  if (action.power > 0) {
    const random = nextRandom(nextSeed);
    nextSeed = random.seed;
    const attackAttribute = action.attribute ?? (action.kind === "soulSkill" ? actor.attribute : "无");
    const multiplier = attributeMultiplier(attackAttribute, target.attribute);
    const variance = 0.94 + random.value * 0.12;
    const rawDamage = effectiveAttack(actor) * action.power * multiplier * variance - effectiveDefense(target) * 0.42;
    const damage = Math.max(5, Math.floor(rawDamage));
    nextTarget = { ...nextTarget, hp: Math.max(0, nextTarget.hp - damage) };
    const counterText = multiplier > 1 ? "，触发属性克制" : multiplier < 1 ? "，伤害受到压制" : "";
    events.push({ round, actorId: actor.id, kind: "damage", amount: damage, text: `${actor.name}使用${action.name}，造成 ${damage} 点伤害${counterText}。` });
  }

  if (action.heal && action.heal > 0) {
    const healing = Math.min(nextActor.stats.maxHp - nextActor.hp, Math.floor(action.heal));
    nextActor = { ...nextActor, hp: nextActor.hp + healing };
    if (healing > 0) events.push({ round, actorId: actor.id, kind: "heal", amount: healing, text: `${actor.name}使用${action.name}，恢复 ${healing} 点生命。` });
  }

  for (const effect of action.effects ?? []) {
    const random = nextRandom(nextSeed);
    nextSeed = random.seed;
    const recipient = effect.target === "self" ? nextActor : nextTarget;
    const controlAdjustment = effect.target === "enemy"
      ? clamp((actor.stats.control - effectiveSpeed(target)) * 0.005, -0.15, 0.15)
      : 0;
    if (random.value > clamp(effect.chance + controlAdjustment, 0, 1)) continue;
    const status: StatusEffect = {
      id: `${actor.id}:${action.id}:${effect.kind}`,
      kind: effect.kind,
      source: action.name,
      remainingTurns: Math.max(1, Math.floor(effect.duration)),
      potency: Math.max(0, effect.potency),
    };
    if (effect.target === "self") nextActor = addStatus(nextActor, status);
    else nextTarget = addStatus(nextTarget, status);
    events.push({ round, actorId: actor.id, kind: "status", text: `${action.name}使${recipient.name}获得${effect.kind}状态。` });
  }
  return { actor: nextActor, target: nextTarget, seed: nextSeed, events };
}

export function chooseEnemyAction(enemy: CombatantState, seed: number) {
  const affordable = enemy.actions.filter((action) => action.energyCost <= enemy.energy);
  if (affordable.length === 0) return { action: null, seed };
  const healing = affordable
    .filter((action) => (action.heal ?? 0) > 0)
    .sort((left, right) => (right.heal ?? 0) - (left.heal ?? 0));
  if (enemy.hp / enemy.stats.maxHp <= 0.35 && healing[0]) return { action: healing[0], seed };
  const totalWeight = affordable.reduce((total, action) => total + Math.max(1, action.aiWeight ?? 1), 0);
  const random = nextRandom(seed);
  let cursor = random.value * totalWeight;
  for (const action of affordable) {
    cursor -= Math.max(1, action.aiWeight ?? 1);
    if (cursor <= 0) return { action, seed: random.seed };
  }
  return { action: affordable[affordable.length - 1], seed: random.seed };
}

function finishIfNeeded(state: BattleState, events: BattleEvent[]): BattleState {
  if (state.enemy.hp <= 0) {
    return {
      ...state,
      status: "won",
      enemy: { ...state.enemy, hp: 0 },
      events: [...state.events, ...events, { round: state.round, actorId: state.player.id, kind: "victory", text: `战胜${state.enemy.name}。` }],
    };
  }
  if (state.player.hp <= 0) {
    return {
      ...state,
      status: "lost",
      player: { ...state.player, hp: 0 },
      events: [...state.events, ...events, { round: state.round, actorId: state.enemy.id, kind: "defeat", text: `${state.player.name}失去继续战斗的力量。` }],
    };
  }
  return { ...state, events: [...state.events, ...events] };
}

export function performBattleTurn(state: BattleState, playerActionId: string): RuleResult<BattleState> {
  if (state.status !== "active") return failure("BATTLE_FINISHED", "战斗已经结束。");
  const requestedAction = state.player.actions.find((action) => action.id === playerActionId);
  if (!requestedAction) return failure("ACTION_NOT_FOUND", "找不到该战斗行动。");
  if (state.player.energy < requestedAction.energyCost) return failure("INSUFFICIENT_ENERGY", "魂力不足，无法释放该魂技。");

  let player = cloneCombatant(state.player);
  let enemy = cloneCombatant(state.enemy);
  let seed = state.seed;
  const events: BattleEvent[] = [];

  const playerStart = resolveTurnStart(player, state.round);
  player = playerStart.actor;
  events.push(...playerStart.events);
  if (player.hp <= 0) return success(finishIfNeeded({ ...state, player, enemy, seed }, events));
  if (!playerStart.skipped) {
    const resolution = performAction(player, enemy, requestedAction, state.round, seed);
    player = resolution.actor;
    enemy = resolution.target;
    seed = resolution.seed;
    events.push(...resolution.events);
  }
  let interim = finishIfNeeded({ ...state, player, enemy, seed }, []);
  if (interim.status !== "active") return success(finishIfNeeded({ ...interim, events: state.events }, events));

  const enemyStart = resolveTurnStart(enemy, state.round);
  enemy = enemyStart.actor;
  events.push(...enemyStart.events);
  if (enemy.hp <= 0) return success(finishIfNeeded({ ...state, player, enemy, seed }, events));
  if (!enemyStart.skipped) {
    const decision = chooseEnemyAction(enemy, seed);
    seed = decision.seed;
    if (decision.action) {
      const resolution = performAction(enemy, player, decision.action, state.round, seed);
      enemy = resolution.actor;
      player = resolution.target;
      seed = resolution.seed;
      events.push(...resolution.events);
    }
  }
  interim = finishIfNeeded({ ...state, player, enemy, seed, round: state.round + 1 }, events);
  return success(interim);
}

export function simulateBattle(
  initial: BattleState,
  selectAction: (state: BattleState) => string,
  maximumTurns = 100,
): RuleResult<BattleState> {
  let state = initial;
  for (let turn = 0; turn < maximumTurns && state.status === "active"; turn += 1) {
    const result = performBattleTurn(state, selectAction(state));
    if (!result.ok) return result;
    state = result.value;
  }
  return success(state);
}
