(function(root,factory){var api=factory(root.CatMapState||(typeof require==='function'?require('./state.js'):null));if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CatMapBridge=api;}(typeof globalThis!=='undefined'?globalThis:this,function(S){
  'use strict';
  function readSave(game){try{return game._parseLSSaveData();}catch(error){if(game.currentSaveIsBroken)throw error;return null;}}
  function mappedBridge(controller,model){var bridge=controller.game._catMapBridge,id=model.options.building;return bridge&&id&&controller.game.bld.buildingsData.some(function(b){return b.name===id;})?bridge:null;}
  function targetTile(bridge,model){var group=S.groupFor(bridge.game.bld.get(model.options.building)),tile=model.catMapExplicit?bridge.map.at(model.catMapTile.q,model.catMapTile.r):bridge.map.cells.find(function(t){return t.district===group&&bridge.map.free(t)>0;});return tile&&tile.owned&&tile.district===group&&bridge.map.free(tile)>0?tile:null;}
  function installBuildingHooks(engine){
    var proto=engine.com.nuclearunicorn.game.ui.BuildingStackableBtnController.prototype;
    if(proto.catMapCapacityHook)return;
    var build=proto.build,pay=proto.payPrice,buy=proto.buyItem,enabled=proto.updateEnabled;
    proto.catMapCapacityHook=true;
    proto.updateEnabled=function(model){enabled.call(this,model);var bridge=mappedBridge(this,model);if(bridge&&!targetTile(bridge,model))model.enabled=false;};
    proto.buyItem=function(model){
      var bridge=mappedBridge(this,model);if(!bridge)return buy.apply(this,arguments);
      bridge.guard();bridge.sync();
      if(!this.game.bld.get(model.options.building).unlocked&&!this.game.devMode)return {itemBought:false,reason:'map-locked'};
      if(!targetTile(bridge,model))return {itemBought:false,reason:'map-capacity'};
      model.catMapBuilt=0;var result=buy.apply(this,arguments);
      function completed(value){return value&&value.itemBought&&!model.catMapBuilt?{itemBought:false,reason:'map-capacity'}:value;}
      if(result&&result.def)result.def=result.def.then(completed);
      return completed(result);
    };
    proto.build=function(model,maximum){
      var bridge=mappedBridge(this,model);if(!bridge)return build.call(this,model,maximum);
      bridge.guard();bridge.sync();var tile=targetTile(bridge,model);
      if(!tile){model.catMapBuilt=0;this.game.msg('地块已满，请在地图中规划新的同类地区。','notice');return 0;}
      model.catMapTile={q:tile.q,r:tile.r};
      model.catMapBuilt=build.call(this,model,Math.min(maximum,model.catMapMaximum||maximum,bridge.map.free(tile)))||0;
      return model.catMapBuilt;
    };
    proto.payPrice=function(model){
      var bridge=this.game._catMapBridge,id=model.options.building;
      if(!bridge||!id||!this.game.bld.buildingsData.some(function(b){return b.name===id;}))return pay.call(this,model);
      var prices=(model.prices||[]).map(function(p){return {name:p.name,val:p.val};});
      pay.call(this,model);
      if(bridge&&id&&model.catMapTile)bridge.map.add(bridge.map.at(model.catMapTile.q,model.catMapTile.r),id,1,prices,this.game.bld.get(id).stage);
    };
    var modern=engine.classes.ui.btn.BuildingBtnModernController.prototype;
    var modernBuild=modern.build;
    modern.build=function(model,maximum){
      var before=model.metadata.val,count=modernBuild.call(this,model,maximum),undo=this.game.undoChange;
      if(model.metadata.val>before&&this.game._catMapBridge&&model.catMapTile&&undo)undo.events.forEach(function(event){if(event.data.action==='build'&&event.data.metaId===model.options.building)event.data.catMapTile=model.catMapTile;});
      return count;
    };
    modern.catMapNativeSell=modern.sell;
    modern.sell=function(event,model){
      var bridge=this.game._catMapBridge,id=model.options.building;
      if(!bridge||!id)return this.catMapNativeSell(event,model);
      bridge.sync();var tile=bridge.map.cells.slice().reverse().find(function(t){return bridge.map.count(t,id)>0;});
      return bridge.sell(id,tile||null);
    };
  }
  function Bridge(game,engine){
    this.game=game;this.engine=engine;var raw=readSave(game);this.map=new S.MapState(raw&&raw.hexMap);game._catMapBridge=this;installBuildingHooks(engine);this.sync();
    var self=this,prepare=game._prepareSaveData,load=game.load,reset=game._resetInternal;
    game._prepareSaveData=function(data){if(self.preparingReset){var fresh=new S.MapState();fresh.reconcile(data.buildings||[],0);data.hexMap=fresh.serialize();}else{self.sync();data.hexMap=self.map.serialize();}return prepare.call(this,data);};
    game._resetInternal=function(){self.preparingReset=true;try{return reset.apply(this,arguments);}finally{self.preparingReset=false;}};
    game.load=function(){var result=load.apply(this,arguments);if(result!==false&&!this.currentSaveIsBroken){var save=readSave(this);self.map.load(save&&save.hexMap);self.sync();}return result;};
    var undo=game.bld.undo;
    game.bld.undo=function(data){if(data.action==='build'&&data.catMapTile)return self.undoBuild(data);return undo.call(this,data);};
  }
  Bridge.prototype.sync=function(){this.map.reconcile(this.game.bld.buildingsData,this.game.village.getJob('woodcutter').value);};
  Bridge.prototype.openSystem=function(id){return this.engine.CatProgression.openSystem(this.game,id);};
  Bridge.prototype.guard=function(){if(this.game.currentSaveIsBroken||this.game.isReadOnly())throw new Error('当前存档不可修改。');if(this.engine.localGame&&this.engine.localGame.canWrite&&!this.engine.localGame.canWrite())throw new Error('存档服务尚未就绪或已发生冲突，请先刷新。');};
  Bridge.prototype.building=function(id){var meta=this.game.bld.get(id),C=meta.stages?this.engine.classes.ui.btn.StagingBldBtnController:this.engine.classes.ui.btn.BuildingBtnModernController,controller=new C(this.game);return {controller:controller,model:controller.fetchModel({key:id,building:id})};};
  Bridge.prototype.research=function(kind,id){var E=this.engine,C=kind==='tech'?E.com.nuclearunicorn.game.ui.TechButtonController:E.com.nuclearunicorn.game.ui.UpgradeButtonController,controller=new C(this.game);return {controller:controller,model:controller.fetchModel({id:id})};};
  Bridge.prototype.buy=function(kind,id,batch,tile){
    this.guard();this.sync();var pair=kind==='building'?this.building(id):this.research(kind,id),meta=pair.model.metadata;
    if(!meta.unlocked||meta.researched||pair.model.visible===false)throw new Error('尚未解锁这项内容。');
    if(!pair.controller.hasResources(pair.model)||!pair.model.enabled)throw new Error('资源不足或条件尚未满足。');
    if(kind==='building'){
      var self=this,group=S.groupFor(this.game.bld.get(id));
      tile=tile||this.map.cells.find(function(t){return t.district===group&&self.map.free(t)>0;});
      if(!tile||tile.district!==group||!tile.owned||!this.map.free(tile))throw new Error('本地块已满或尚未规划，请扩展并选择新的地区。');
      pair.model.catMapTile={q:tile.q,r:tile.r};pair.model.catMapExplicit=true;pair.model.catMapMaximum=batch===10?10:1;
    }
    var result=pair.controller.buyItem(pair.model,kind==='building'&&batch===10?{ctrlKey:true}:{});
    if(result&&result.def){var owner=this;return Promise.resolve(result.def).then(function(value){owner.after();return value;});}
    this.after();return result;
  };
  Bridge.prototype.after=function(){this.game.village.updateResourceProduction();this.game.updateCaches();this.game.render();this.sync();};
  Bridge.prototype.job=function(id,delta){this.guard();var job=this.game.village.getJob(id);if(!job||!job.unlocked)throw new Error('这个职业尚未解锁。');if(delta>0){if(this.game.village.getFreeKittens()<1)throw new Error('没有空闲猫咪。');if(job.value>=this.game.village.getJobLimit(id))throw new Error('该职业的岗位已达上限。');this.game.village.assignJob(job,1);}else{var kitten=this.game.village.sim.kittens.find(function(k){return k.job===id;});if(!kitten)throw new Error('该岗位没有猫咪。');this.game.village.unassignJob(kitten);}this.after();};
  Bridge.prototype.craft=function(id,amount){this.guard();var craft=this.game.workshop.getCraft(id);if(!craft||!craft.unlocked||id!=='wood'&&!this.game.bld.get('workshop').val)throw new Error('配方或工坊尚未解锁。');var prices=this.game.workshop.getCraftPrice(craft).map(function(p){return {name:p.name,val:p.val*amount};});if(!this.game.resPool.hasRes(prices))throw new Error('合成原料不足。');this.game.workshop.craft(id,amount);this.after();};
  Bridge.prototype.gather=function(){this.guard();var controller=new this.engine.classes.game.ui.GatherCatnipButtonController(this.game);controller.buyItem(controller.fetchModel({name:'采集猫薄荷'}),{});this.after();};
  Bridge.prototype.hunt=function(){this.guard();if(!this.game.science.get('archery').researched)throw new Error('先研究箭术。');var controller=new this.engine.classes.village.ui.HuntButtonController(this.game),model=controller.fetchModel({name:'狩猎'});if(model.visible===false)throw new Error('当前条件不允许狩猎。');var result=controller.buyItem(model,{});if(!result.itemBought)throw new Error('猫力不足。');this.after();};
  Bridge.prototype.toggle=function(id){
    this.guard();var pair=this.building(id),model=pair.model;
    if(!model.metadata.val||!model.togglable&&!model.togglableOnOffLink)throw new Error('该设施不支持此开关。');
    if(model.togglableOnOffLink)pair.controller.handleTogglableOnOffClick(model);
    else pair.controller[model.metadata.on?'offAll':'onAll'](model);
    if(model.metaAccessor)model.metaAccessor.set('on',model.metadata.on);
    this.game.upgrade({buildings:[id]});this.after();
  };
  Bridge.prototype.refundRatio=function(){var ratio=S.config.demolitionRefundRatio;return Number.isFinite(ratio)&&ratio>=0&&ratio<=1?ratio:0.5;};
  Bridge.prototype.refund=function(id,tile){
    var lot=this.map.peek(tile,id);if(!lot)return null;
    var prices=lot.prices;
    if(!prices){var pair=this.building(id);prices=this.game.bld.getPricesWithAccessor(pair.model.metaAccessor,-1);}
    var ratio=this.refundRatio();
    return {estimated:!lot.prices,prices:prices.map(function(p){return {name:p.name,val:p.val*ratio};})};
  };
  Bridge.prototype.sell=function(id,tile){
    this.guard();this.sync();
    if(tile&&this.map.at(tile.q,tile.r)!==tile)throw new Error('地块已变化，请重新选择。');
    var pair=this.building(id),refund=this.refund(id,tile),before=this.game.bld.get(id).val,received=[];
    if(!refund||!before||!pair.controller.hasSellLink(pair.model))throw new Error('选中地块没有可拆除的这类建筑。');
    var game=this.game;
    pair.controller.refund=function(){refund.prices.forEach(function(price){received.push({name:price.name,val:game.resPool.addResEvent(price.name,price.val)});});};
    pair.controller.catMapNativeSell({},pair.model);
    if(game.bld.get(id).val!==before-1)throw new Error('原版条件不允许拆除此建筑。');
    this.map.remove(tile,id,1);
    // Native undo recomputes current prices, which cannot restore a historical-cost demolition.
    game.undoChange=null;game._publish('server/undoStateChanged');
    this.after();return {prices:received,estimated:refund.estimated};
  };
  Bridge.prototype.place=function(id,tile){this.guard();this.sync();if(!this.map.place(tile,id,1))throw new Error('没有待安置建筑或地块容量不足。');this.after();};
  Bridge.prototype.undoBuild=function(data){
    this.guard();this.sync();var tile=this.map.at(data.catMapTile.q,data.catMapTile.r),id=data.metaId;
    if(!tile||this.map.count(tile,id)<data.val)return;
    var pair=this.building(id),self=this;
    pair.controller.refund=function(){var lot=self.map.peek(tile,id),prices=lot.prices||pair.model.prices;prices.forEach(function(p){self.game.resPool.addResEvent(p.name,p.val);});self.map.remove(tile,id,1);};
    pair.controller.sellInternal(pair.model,pair.model.metadata.val-data.val,false);this.after();
  };
  return Bridge;
}));
