const fs = require('fs');
const vm = require('vm');
const Flow = require('../map/progression');
const Bridge = require('../map/bridge');
const State = require('../map/state');
const World = require('../hex-demo/world');

test('map shell mounts against the real engine and routes gather, guidance preferences and blocked writes without changing game instances', async () => {
  global.gamePage = global.game = new com.nuclearunicorn.game.ui.GamePage();
  game.setUI(new classes.ui.UISystem('gameContainerId'));
  game.resetState();
  game.render = jest.fn();
  LCstorage.removeItem('com.nuclearunicorn.kittengame.savedata');
  document.body.innerHTML='';
  const flow=Flow.metadata(),errors=[],scope={
    document,location:{search:''},URLSearchParams,Option:window.Option,Date,Set,
    catGameReady:game,CatMapBridge:Bridge,CatMapState:State,HexWorld:World,CatProgression:Flow,classes,com,
    console:{error:error=>errors.push(error)},setInterval:()=>1,
    fetch:async()=>({ok:true,text:async()=>fs.readFileSync(require.resolve('../map/shell.html'),'utf8')}),
    CatTechTree:{create:()=>({open(){},update(){}})},
    localGame:{canWrite:()=>true,getProgression:()=>flow,getEntry:()=>null,hideGuidance:hidden=>{flow.hidden=hidden;},bindSaveInterval(){},bindGameSpeed(){}}
  };
  scope.window=scope;
  scope.createHexView=options=>({refresh(){},select(q,r){options.onSelect(options.cells.find(t=>t.q===q&&t.r===r));}});
  vm.runInNewContext(fs.readFileSync(require.resolve('../map/app.js'),'utf8'),scope);
  for(let n=0;n<30;n++)await Promise.resolve();
  expect(errors).toEqual([]);
  const before=game.resPool.get('catnip').value;
  await document.getElementById('gather-catnip').onclick();
  for(let n=0;n<10;n++)await Promise.resolve();
  expect(game.resPool.get('catnip').value).toBe(before+1);
  document.getElementById('guidance-toggle').onclick();
  expect(flow.hidden).toBe(true);
  document.getElementById('guidance-toggle').onclick();
  expect(flow.hidden).toBe(false);
  scope.localGame.canWrite=()=>false;
  await document.getElementById('gather-catnip').onclick();
  for(let n=0;n<10;n++)await Promise.resolve();
  expect(game.resPool.get('catnip').value).toBe(before+1);
  expect(scope.catMapBridge.game).toBe(game);
  expect(errors).toEqual([]);
});
