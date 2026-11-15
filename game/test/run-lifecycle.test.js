const fs = require('fs');
const vm = require('vm');
const Flow = require('../map/progression');
const Bridge = require('../map/bridge');
const source = fs.readFileSync(require.resolve('../local-client.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

async function session(saved, {speed=1,deferEntry=false}={}) {
  global.gamePage = global.game = new com.nuclearunicorn.game.ui.GamePage();
  game.setUI(new classes.ui.UISystem('gameContainerId'));
  game.resetState();
  LCstorage.removeItem('com.nuclearunicorn.kittengame.savedata');
  if (saved) { LCstorage.setItem('com.nuclearunicorn.kittengame.savedata', JSON.stringify(saved)); game.load(); }
  const current = game;
  const engine={classes, com, CatProgression:Flow};
  new Bridge(current, engine);
  let disk = {revision:saved?'loaded':null,save:saved||null}, index=0, failure='', confirm;
  const writes=[], reload=jest.fn(), reset=jest.spyOn(current, '_resetInternal');
  current.ui.confirm = (title, message, yes, no) => { confirm={message,yes,no}; };
  const scope = {
    CatProgression:Flow, localStorage:LCstorage, location:{reload},
    document:{getElementById:()=>null,querySelectorAll:()=>[],addEventListener(){}},
    XMLHttpRequest:class { open(){} send(){this.status=200;this.responseText=JSON.stringify(disk);} },
    setInterval:()=>1,clearInterval(){},addEventListener(){},
    fetch:async (url,options) => {
      if(url==='/api/state')return {ok:true,json:async()=>clone(disk)};
      if(url==='/api/health')return {ok:true,json:async()=>({resetProtocol:1})};
      const body=JSON.parse(options.body);writes.push(body);
      if(failure==='backup'&&body.kind==='manual')throw new Error('backup failed');
      if(failure==='commit'&&body.kind==='reset')throw new Error('commit failed');
      if(failure==='replace'&&body.kind==='import')throw new Error('import failed');
      if(body.revision!==disk.revision)return {ok:false,status:409,json:async()=>({error:'conflict'})};
      disk={revision:String(++index),save:clone(body.save),operationId:body.operationId,savedAt:new Date().toISOString()};
      if(failure==='response'&&body.kind==='reset')throw new Error('response lost');
      return {ok:true,json:async()=>clone(disk)};
    }
  };
  scope.window=scope;
  vm.runInNewContext(source,scope);
  engine.localGame=scope.localGame;
  scope.localGame.attach(current);
  scope.localGame.setGameSpeed(speed);
  if (!deferEntry) {
    if (!scope.localGame.getEntry()) current.tick();
    await scope.localGame.save('manual');
  }
  const settle=async()=>{for(let n=0;n<80;n++)await Promise.resolve();};
  return {game:current,api:scope.localGame,writes,reload,reset,settle,get disk(){return disk;},get confirm(){return confirm;},fail(value){failure=value;},conflict(){disk={...disk,revision:'other-window'};}};
}

test('native reset preview cancels without mutations; successful reset backs up before hooks, persists one result, and acknowledges its summary', async () => {
  const s=await session();
  s.game.bld.get('hut').val=s.game.bld.get('hut').on=1;
  s.game.resPool.get('kittens').value=90;
  s.game.reset();
  expect(s.confirm.message).toContain('预计获得威望 20');
  s.confirm.no();
  expect(s.reset).not.toHaveBeenCalled();
  expect(s.game.bld.get('hut').val).toBe(1);
  s.game.reset();
  const hook=jest.spyOn(s.game.challenges,'onRunReset');
  await s.confirm.yes();await s.settle();
  expect(hook).toHaveBeenCalledTimes(1);
  expect(s.reset).toHaveBeenCalledTimes(1);
  expect(s.api.getResetState()).toBe('completed');
  expect(s.reload).toHaveBeenCalledTimes(1);
  expect(s.disk.save.progression.pendingRunSummary.read).toBe(false);
  expect(s.disk.save.hexMap.goal).toBe(null);
  expect(s.disk.save.buildings.every(b=>!b.val)).toBe(true);
  const loaded=await session(s.disk.save);
  expect(loaded.api.getProgression().pendingRunSummary.paragon).toBe(20);
  await loaded.api.dismissSummary();
  const again=await session(loaded.disk.save);
  expect(again.api.getProgression().pendingRunSummary.read).toBe(true);
});

test('backup failure and double confirmation cannot run native reset or challenge hooks', async () => {
  const s=await session();s.fail('backup');
  const hook=jest.spyOn(s.game.challenges,'onRunReset');
  s.game.reset();
  await Promise.all([s.confirm.yes(),s.confirm.yes()]);await s.settle();
  expect(s.reset).not.toHaveBeenCalled();expect(hook).not.toHaveBeenCalled();
  expect(s.api.getResetState()).toBe('failed-before-reset');
  expect(s.api.canWrite()).toBe(true);
  s.fail('');s.game.reset();await s.confirm.yes();await s.settle();
  expect(s.reset).toHaveBeenCalledTimes(1);
  expect(s.api.getResetState()).toBe('completed');
});

test('commit failure pauses simulation and saves, retries the exact candidate, and handles a lost response without a second reset', async () => {
  const s=await session();s.fail('commit');
  s.game.reset();await s.confirm.yes();await s.settle();
  expect(s.api.getResetState()).toBe('failed-after-reset');
  expect(s.game.isPaused).toBe(true);expect(s.api.canWrite()).toBe(false);
  await expect(s.api.save()).rejects.toThrow();
  const first=s.writes.find(w=>w.kind==='reset');
  s.game.save();
  s.fail('response');await s.api.retryReset();
  const attempts=s.writes.filter(w=>w.kind==='reset');
  expect(attempts).toHaveLength(2);
  expect(attempts[1].save).toEqual(first.save);
  expect(attempts[1].operationId).toBe(first.operationId);
  expect(s.reset).toHaveBeenCalledTimes(1);
  expect(s.api.getResetState()).toBe('completed');
});

test('another window after a failed result prevents retry from overwriting it', async () => {
  const s=await session();s.fail('commit');
  s.game.reset();await s.confirm.yes();await s.settle();
  const attempts=s.writes.filter(w=>w.kind==='reset').length;
  s.conflict();s.fail('');await s.api.retryReset();
  expect(s.api.getResetState()).toBe('conflict');
  expect(s.writes.filter(w=>w.kind==='reset')).toHaveLength(attempts);
  expect(s.disk.revision).toBe('other-window');
  expect(s.reset).toHaveBeenCalledTimes(1);
});

test('challenge activation also backs up before destructive challenge preparation', async () => {
  const s=await session();
  const challenge=s.game.challenges.getChallenge('winterIsComing');challenge.pending=true;
  s.game.bld.get('chronosphere').val=1;
  s.fail('backup');s.game.challenges.applyPending(false);await s.confirm.yes();await s.settle();
  expect(s.game.bld.get('chronosphere').val).toBe(1);
  expect(s.reset).not.toHaveBeenCalled();
  s.fail('');s.game.challenges.applyPending(false);await s.confirm.yes();await s.settle();
  expect(s.api.getResetState()).toBe('completed');
  expect(s.disk.save.challenges.challenges.find(c=>c.name==='winterIsComing').active).toBe(true);
});

test('a failed backup import cannot release the suspended state of an uncommitted reset', async () => {
  const s=await session();s.fail('commit');
  s.game.reset();await s.confirm.yes();await s.settle();
  expect(s.api.getResetState()).toBe('failed-after-reset');
  s.fail('replace');const callback=jest.fn();
  s.game._loadSaveJson(JSON.stringify(s.disk.save),callback);await s.settle();
  expect(callback).toHaveBeenCalledWith(expect.any(Error));
  expect(s.api.canWrite()).toBe(false);
  expect(s.game.isReadOnly()).toBe(true);
  expect(s.game.isPaused).toBe(true);
  s.fail('');await s.api.retryReset();
  expect(s.reset).toHaveBeenCalledTimes(1);
  expect(s.api.getResetState()).toBe('completed');
});

test('reentry waits for the first native offline calculation and does not multiply its gains by the page speed', async () => {
  const initial=await session();
  initial.game.bld.get('field').val=initial.game.bld.get('field').on=10;
  initial.game.opts.enableRedshift=true;
  initial.game.updateCaches();
  const saved=clone(initial.game.save());
  saved.time.timestamp=Date.now()-60000;
  saved.progression.baseline.at=saved.time.timestamp;
  const values=[];
  for (const speed of [1,20]) {
    const s=await session(clone(saved),{speed,deferEntry:true});
    expect(s.api.getEntry()).toBeUndefined();
    expect(s.api.canWrite()).toBe(false);
    expect(s.writes).toHaveLength(0);
    s.game.save();await expect(s.api.save()).rejects.toThrow();
    expect(s.writes).toHaveLength(0);
    const redshift=jest.spyOn(s.game.time,'applyRedshift');
    s.game.tick();await s.settle();
    expect(redshift).toHaveBeenCalledTimes(1);
    const entry=s.api.getEntry();
    expect(entry.elapsed).toBeGreaterThanOrEqual(60000);
    expect(s.api.canWrite()).toBe(true);
    values.push(entry.changes.find(r=>r.name==='catnip').value);
    s.game.tick();await s.settle();
    expect(redshift).toHaveBeenCalledTimes(1);
  }
  expect(values[0]).toBeGreaterThan(0);
  expect(values[1]).toBeCloseTo(values[0]);
});

test('offline queue construction retains native write access only inside the synchronous engine settlement', async () => {
  const initial=await session();
  initial.game.opts.enableRedshift=true;
  initial.game.bld.get('field').unlocked=true;
  initial.game.resPool.get('catnip').value=1000;
  initial.game.time.queue.addToQueue('field','buildings','field');
  const saved=clone(initial.game.save());
  initial.game.time.queue.queueItems=[];
  saved.time.timestamp=Date.now()-60000;
  const s=await session(saved,{deferEntry:true});
  expect(s.api.canWrite()).toBe(false);
  expect(s.game.bld.get('field').val).toBe(0);
  expect(s.game.bld.get('field').on).toBe(0);
  expect(s.game.time.queue.queueLength()).toBe(1);
  s.game.tick();await s.settle();
  expect(s.game.bld.get('field').val).toBe(1);
  expect(s.game.time.queue.queueLength()).toBe(0);
  expect(s.api.getEntry()).toBeDefined();
  expect(s.api.canWrite()).toBe(true);
});
