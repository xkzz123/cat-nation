const Flow = require('../map/progression');
const Bridge = require('../map/bridge');

function fresh() {
  global.gamePage = global.game = new com.nuclearunicorn.game.ui.GamePage();
  game.setUI(new classes.ui.UISystem('gameContainerId'));
  game.resetState();
  LCstorage.removeItem('com.nuclearunicorn.kittengame.savedata');
  return new Bridge(game, { classes, com, CatProgression: Flow });
}
function existing(id) { game.bld.get(id).val = game.bld.get(id).on = 1; }
function kittens(count) { for (let n = 0; n < count; n++) game.village.sim.addKitten(); }

test('state-derived journey follows opening, population, scholars, mining and industrial follow-through, including a restored earlier save', () => {
  const bridge = fresh();
  const next = () => { bridge.sync(); return Flow.evaluate(game, bridge, null); };
  expect(next().id).toBe('gather');
  game.resPool.get('catnip').value = 20;
  game.bld.get('field').unlocked = true;
  expect(next().id).toBe('first-field');
  bridge.buy('building', 'field', 1, bridge.map.at(0, 1));
  expect(next().id).toBe('build-hut');
  existing('hut');
  expect(next().id).toBe('population');
  kittens(2);
  expect(next().id).toBe('build-library');
  existing('library');
  expect(next().id).toBe('scholars');
  game.village.assignJob(game.village.getJob('scholar'), 1);
  game.science.get('mining').researched = true;
  expect(next().id).toBe('build-mine');
  existing('mine');
  expect(next().id).toBe('miners');
  game.village.assignJob(game.village.getJob('miner'), 1);
  expect(next().id).toBe('build-workshop');
  existing('workshop');
  game.science.get('metal').researched = true;
  expect(next().id).toBe('build-smelter');
  existing('smelter');
  expect(next().id).toBe('branches');
  game.science.get('mechanization').researched = true;
  expect(next().id).toBe('build-factory');
  existing('factory');
  expect(next().id).toBe('engineers');
  kittens(1);
  game.village.getJob('engineer').unlocked = true;
  game.village.assignJob(game.village.getJob('engineer'), 1);
  expect(next().id).toBe('branches');
  const before = game.save();
  game.bld.get('mine').val = 0;
  expect(next().id).toBe('build-mine');
  LCstorage.setItem('com.nuclearunicorn.kittengame.savedata', JSON.stringify(before));
  game.load();
  expect(next().id).toBe('branches');
  game.challenges.getChallenge('winterIsComing').active = true;
  expect(next().id).toBe('active-challenge');
  game.challenges.getChallenge('winterIsComing').active = false;
  expect(next().id).toBe('branches');
});

test('blockers distinguish capacity, terrain slots, unlocked recipes and unknown native conditions without spending', () => {
  const bridge = fresh();
  game.bld.get('hut').unlocked = true;
  game.resPool.get('wood').maxValue = 1;
  game.resPool.get('wood').value = 0;
  bridge.map.cells.forEach(t => { if (t.district === 'housing') t.lots.hut = [{count:10,stage:0,prices:null}]; });
  bridge.map.refresh();
  const before = game.resPool.get('wood').value;
  const reasons = Flow.blockers(game, bridge, 'building', 'hut');
  expect(reasons.map(r => r.type)).toEqual(expect.arrayContaining(['capacity', 'land', 'craft']));
  expect(game.resPool.get('wood').value).toBe(before);
  game.science.get('navigation').unlocked = true;
  game.workshop.getCraft('scaffold').unlocked = true;
  expect(Flow.blockers(game, bridge, 'tech', 'navigation').some(r => r.type === 'craft')).toBe(true);
});

test('survival estimates use actual simulation speed, pause and zero population without changing the economy', () => {
  fresh();
  game.resPool.get('catnip').value = 100;
  game.getResourcePerTick = () => -2;
  game.getTicksPerSecondUI = () => 5;
  expect(Flow.risk(game).seconds).toBe(10);
  game.getTicksPerSecondUI = () => 100;
  expect(Flow.risk(game).seconds).toBe(0.5);
  game.isPaused = true;
  expect(Flow.risk(game).seconds).toBe(null);
  expect(Flow.risk(game).zeroPopulation).toBe(true);
  game.getResourcePerTick = () => 0;
  expect(Flow.risk(game).active).toBe(false);
  expect(game.resPool.get('catnip').value).toBe(100);
});

test('advanced systems honor real tab visibility and policy unlocks; reset preview is read-only and matches native prestige', () => {
  const bridge = fresh();
  expect(Flow.advanced(game).find(s => s.id === 'space').available).toBe(false);
  expect(() => bridge.openSystem('space')).toThrow();
  game.render = jest.fn();
  ['Trade','Religion','Space','Science','Workshop','Time','Challenges'].forEach(id => { game.tabs.find(t => t.tabId === id).visible = true; });
  game.science.policies[0].unlocked = true;
  game.libraryTab.policyPanel = {collapse:jest.fn()};
  ['trade','religion','space','policy','workshop','time','challenges'].forEach(id => {
    expect(bridge.openSystem(id).available).toBe(true);
    expect(game.ui.activeTabId).toBe(Flow.advanced(game).find(s => s.id === id).tab);
  });
  expect(game.libraryTab.policyPanel.collapse).toHaveBeenCalledWith(false);
  game.resPool.get('kittens').value = 90;
  const before = game.save(), preview = Flow.preview(game);
  expect(preview.paragon).toBe(game.getResetPrestige().paragonPoints);
  expect(preview.karmaKittens).toBe(game.getResetPrestige().karmaKittens);
  expect(game.save().resources).toEqual(before.resources);
  expect(game.save().buildings).toEqual(before.buildings);
});

test('reentry compares only known save baselines and ignores unsupported metadata without recalculating offline gains', () => {
  fresh();
  const previous = Flow.baseline(game, 1000);
  game.resPool.get('wood').value = 123;
  const result = Flow.reentry(game, previous, '磁盘存档', 2000);
  expect(result.elapsed).toBe(1000);
  expect(result.changes.find(r => r.name === 'wood').value).toBe(123);
  expect(Flow.reentry(game, previous, '磁盘存档', 0).elapsed).toBe(null);
  expect(Flow.reentry(game, null, '新游戏', 0).changes).toEqual([]);
  expect(Flow.metadata({version:99,hidden:true,trackedObjective:'space'}).trackedObjective).toBe(null);
  expect(Flow.metadata().version).toBe(1);
  expect(Flow.metadata({version:1,baseline:{at:1,population:0,resources:'bad'},pendingRunSummary:{id:'bad'}}).baseline).toBe(null);
  expect(Flow.metadata({version:1,pendingRunSummary:{id:'bad'}}).pendingRunSummary).toBe(null);
  expect(Flow.reentry(game,{at:0,population:0,resources:[null,{name:'wood',value:'invalid'}]},'磁盘存档',2000).changes.every(r=>r.value===null)).toBe(true);
});

test('first winter and recovery use the live engine calendar and seasonal production, and the resulting save resumes without replaying opening actions', () => {
  const bridge=fresh();
  game.opts.enableRedshift=false;
  existing('hut');existing('field');
  game.bld.get('field').val=game.bld.get('field').on=50;
  game.resPool.get('catnip').value=1000;
  game.updateCaches();
  for(let n=0;game.calendar.season<3&&n<6000;n++)game.tick();
  expect(game.calendar.season).toBe(3);
  expect(Flow.risk(game).rate).toBeCloseTo(game.getResourcePerTick('catnip',true)*game.getTicksPerSecondUI());
  const stock=game.resPool.get('catnip').value;
  game.isPaused=true;game.tick();expect(game.resPool.get('catnip').value).toBe(stock);
  const saved=game.save();
  LCstorage.setItem('com.nuclearunicorn.kittengame.savedata',JSON.stringify(saved));
  game.load();bridge.sync();
  expect(game.calendar.season).toBe(3);
  expect(Flow.evaluate(game,bridge,null).id).not.toBe('gather');
  game.village.sim.kittens=[];
  expect(Flow.evaluate(game,bridge,null).id).toBe('population');
});
