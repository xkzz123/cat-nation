(function () {
  'use strict';
  var classic = new URLSearchParams(location.search).get('view') === 'classic' || new URLSearchParams(location.search).has('saveId');
  var bridge, game, view, techTree, activePanel='district', busy=false, expanded=false, sceneKey='', lastCells, selectedTile, focusGroup, noticeUntil=0;
  var objective, previousObjective, previousTracking, foodRisk=false, entryShown=false, advancedSignature='';
  var priority=['calendar','agriculture','mining','archery','animal','math','construction','metal','engineering','writing','steel','civil','currency','philosophy','theology','astronomy','navigation','physics','chemistry','electricity','industrialization','mechanization','electronics','rocketry','sattelites','orbitalEngineering','nuclearFission','particlePhysics','chronophysics'];
  var $=function(id){return document.getElementById(id);};
  var strip=function(text){return String(text||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ');};
  function element(tag,className,text){var e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
  function number(value){if(!Number.isFinite(value))return '—';var n=Math.abs(value);return n>=1e9?(value/1e9).toFixed(2)+'G':n>=1e6?(value/1e6).toFixed(2)+'M':n>=10000?(value/1000).toFixed(1)+'k':value.toLocaleString('zh-CN',{maximumFractionDigits:n<10?2:1});}
  function resource(id){return game.resPool.get(id);}
  function pricesText(prices){return (prices||[]).map(function(p){return (resource(p.name).title||p.name)+' '+number(p.val);}).join(' · ')||'无需资源';}
  function deficient(prices){return (prices||[]).filter(function(p){return resource(p.name).value+1e-8<p.val;}).map(function(p){return {name:p.name,val:p.val-resource(p.name).value};});}
  function tooSmall(prices){return (prices||[]).filter(function(p){return resource(p.name).value<p.val&&resource(p.name).maxValue>0&&resource(p.name).maxValue+1e-8<p.val;});}
  function message(text,error){if(!$('map-notice'))return;$('map-notice').textContent=text;$('map-notice').classList.toggle('error',!!error);noticeUntil=Date.now()+7000;}
  async function act(fn){if(busy)return;busy=true;try{bridge.guard();var result=await fn();if(result&&result.itemBought===false)throw new Error('操作未完成：'+result.reason);bridge.sync();sceneKey='';refresh();}catch(error){message(error.message||String(error),true);}finally{busy=false;}}
  function panel(name){if(name==='science'){openTechTree();return;}activePanel=name;document.querySelectorAll('#hex-app [data-panel]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.panel===name));});['district','village','workshop'].forEach(function(p){$('panel-'+p).hidden=p!==name;});refreshActions();}
  function openTechTree(){var plan=techPlan();techTree.open(bridge.map.goal||(plan&&plan.next.name));}
  function focusDistrict(id){
    panel('district');var tile=bridge.map.cells.find(function(t){return t.district===id&&bridge.map.free(t)>0;});
    if(!tile)tile=bridge.map.cells.find(function(t){return !t.district&&t.owned&&bridge.map.suitable(t,id);})||bridge.map.cells.find(function(t){return !t.district&&t.frontier&&bridge.map.suitable(t,id);});
    if(tile){view.select(tile.q,tile.r);if(!$('district-kind').disabled&&Array.from($('district-kind').options).some(function(o){return o.value===id;}))$('district-kind').value=id;if(!tile.district)message('先在这块土地规划'+CatMapState.districts[id].name+'，再建造设施。');}
    else message('当前没有可用的合适地块。请检查现有槽位、拆除和待安置建筑；地图容量有限。');
  }
  function cardList(id,items){
    var container=$(id),keys=new Set(items.map(function(item){return item.id;}));
    Array.from(container.children).forEach(function(row){if(!keys.has(row.dataset.key))row.remove();});
    items.forEach(function(item,index){
      var row=Array.from(container.children).find(function(r){return r.dataset.key===item.id;});
      if(!row){row=element('article','action-card');row.dataset.key=item.id;var title=element('div','action-title');title.append(element('strong','name'),element('span','action-count'));row.append(title,element('div','action-desc'),element('div','action-prices'),element('div','action-status'),element('div','actions'));container.append(row);}
      row.querySelector('.name').textContent=item.title;row.querySelector('.action-count').textContent=item.count||'';row.querySelector('.action-desc').textContent=item.description||'';row.querySelector('.action-prices').textContent=item.prices||'';row.querySelector('.action-status').textContent=item.status||'';row.classList.toggle('focused',!!item.focused);
      var actions=row.querySelector('.actions');var labels=item.actions.map(function(a){return a.key;}).join('|');
      if(actions.dataset.keys!==labels){actions.replaceChildren();item.actions.forEach(function(action){var b=element('button',null,action.label);b.dataset.key=action.key;b.onclick=function(){var current=row._item.actions.find(function(a){return a.key===b.dataset.key;});if(current)current.run();};actions.append(b);});actions.dataset.keys=labels;}
      row._item=item;Array.from(actions.children).forEach(function(b,i){b.textContent=item.actions[i].label;b.disabled=!!item.actions[i].disabled;});
      if(container.children[index]!==row)container.insertBefore(row,container.children[index]||null);
    });
    if(!items.length){if(!container.querySelector('.empty'))container.append(element('p','help empty','暂无可用内容。继续建设并研究相关科技。'));}
  }
  function demolition(id,tile){return act(function(){var result=bridge.sell(id,tile);message('已拆除 1 座，实际返还：'+pricesText(result.prices)+(result.estimated?'（旧存量按当前公式估算）':''));});}
  function tileFacts(tile){
    if(!tile||!CatMapState.districts[tile.district])return tile&&tile.owned?'聚落领地':'尚未纳入';
    var reserve=Object.keys(bridge.map.groups).filter(function(id){return bridge.map.groups[id].district===tile.district;}).reduce(function(sum,id){return sum+bridge.map.reserveCount(id);},0);
    return '本格建筑 '+number(tile.count)+' / '+bridge.map.capacity(tile)+' 槽位'+(reserve?' · 待安置建筑 '+number(reserve)+' 座':'');
  }
  function buildingItems(){
    if(!selectedTile||!selectedTile.owned)return [];
    var group=selectedTile.district,home=group==='home',tile=selectedTile;
    return game.bld.buildingsData.filter(function(b){return home?['field','hut','library'].includes(b.name):CatMapState.groupFor(b)===group;}).map(function(b){
      var pair=bridge.building(b.name),m=pair.model,meta=m.metadata,missing=deficient(m.prices),capacity=tooSmall(m.prices),belongs=home?CatMapState.groupFor(b):group,local=bridge.map.count(tile,b.name),free=bridge.map.free(tile),reserve=bridge.map.reserveCount(b.name);
      var parents=game.science.techs.filter(function(t){return !t.researched&&t.unlocks&&t.unlocks.buildings&&t.unlocks.buildings.includes(b.name);});
      var reason=!b.unlocked?(parents.length?'前置科技：'+parents.map(function(t){return strip(t.label);}).join('、'):'收集所需资源或研究前置科技后开放'):!home&&!free?'本格已满，请规划新的同类地块。':capacity.length?'容量不足：'+pricesText(capacity):missing.length?'还缺：'+pricesText(missing):'材料齐备，可以建设';
      var actions=[{key:'build',label:home?'前往'+CatMapState.districts[belongs].name:!free?'本格已满':'建造'+(Number($('build-batch').value)===10?'（最多 '+Math.min(10,free)+' 座）':' ×1'),disabled:!home&&(!free||!b.unlocked||!m.enabled||missing.length>0),run:function(){if(home)focusDistrict(belongs);else act(function(){return bridge.buy('building',b.name,Number($('build-batch').value),tile);});}}];
      if(!home&&local>0){
        var refund=bridge.refund(b.name,tile);
        reason+=' · 拆除返还 '+Math.round(bridge.refundRatio()*100)+'%：'+pricesText(refund.prices)+(refund.estimated?'（旧存量估算）':'（按建造实付）');
        actions.push({key:'sell',label:'拆除 1 座',disabled:!pair.controller.hasSellLink(m),run:function(){demolition(b.name,tile);}});
        if(m.togglable||m.togglableOnOffLink)actions.push({key:'toggle',label:meta.on?'全局暂停设施':'全局启用设施',run:function(){act(function(){bridge.toggle(b.name);});}});
      }
      if(!home&&reserve>0){
        reason+=' · 待安置 '+number(reserve)+' 座（已计入全局产出）';
        actions.push({key:'place',label:'安置已有建筑 1 座',disabled:!free,run:function(){act(function(){bridge.place(b.name,tile);});}});
        actions.push({key:'sell-reserve',label:'拆除待安置 1 座',disabled:!pair.controller.hasSellLink(m),run:function(){demolition(b.name,null);}});
      }
      if(!home&&m.stageLinks&&m.stageLinks.length)reason+=' · 阶段切换影响全部同类建筑，请到原版界面操作。';
      return {id:b.name,title:strip(meta.label||b.label),count:home?'全局 '+number(b.val):'本格 '+number(local)+' / 全局 '+number(b.val)+(m.togglable?' · 全局开启 '+number(meta.on):''),description:strip(meta.description),prices:'建造费用：'+pricesText(m.prices),status:reason,actions:actions};
    });
  }
  function onSelect(tile){
    selectedTile=tile;panel('district');
    var d=CatMapState.districts[tile.district],nature=HexWorld.names[tile.baseTerrain];
    $('coordinates').textContent='Q '+tile.q+' · R '+tile.r;$('tile-type').textContent=tile.district==='home'?'聚落中心':nature+' / '+(tile.owned?'已纳入聚落':'聚落边缘');
    $('tile-title').textContent=tile.district==='home'?'第一簇营火':d?d.name:tile.explored?nature+'空地':'未探索的远方';
    $('tile-description').textContent=tile.district==='home'?'在这里采集、精炼，或前往各个地区建设。每一座建筑都来自真实进度。':d?'本格独立记录建筑，同类地区可以在多块土地分别建设。每座建筑占用一个槽位，先逐个拆除至空地才能更换地区。':tile.frontier?'这块土地与聚落相邻，可以勘察并纳入规划。':tile.owned?'选择适合这片地形的地区类型，开始规划。':'先从相邻领地逐步扩展，便能走到这里。';
    $('tile-facts').textContent=tileFacts(tile);
    $('claim-tile').hidden=!tile.frontier;$('district-planning').hidden=!tile.owned||tile.district==='home'||tile.count>0;
    var allowed=Object.keys(CatMapState.districts).filter(function(id){return bridge.map.suitable(tile,id);});
    var select=$('district-kind'),previous=select.value,sig=allowed.join(',');
    if(select.dataset.signature!==sig){select.replaceChildren();allowed.forEach(function(id){select.append(new Option(CatMapState.districts[id].name,id));});select.dataset.signature=sig;}
    if(tile.district&&allowed.includes(tile.district))select.value=tile.district;else if(allowed.includes(previous))select.value=previous;
    select.disabled=!allowed.length||tile.count>0;$('assign-district').disabled=!allowed.length||tile.count>0;$('clear-district').hidden=!d||tile.count>0;$('clear-district').disabled=tile.count>0;
    $('home-links').replaceChildren();if(tile.district==='home')Object.keys(CatMapState.districts).filter(function(id){return ['agriculture','housing','science','mining','forestry','storage','industry'].includes(id);}).forEach(function(id){var b=element('button',null,CatMapState.districts[id].name);b.onclick=function(){focusDistrict(id);};$('home-links').append(b);});
    refreshActions();
  }
  function techPlan(){
    var techs=game.science.techs,goal=techs.find(function(t){return t.name===bridge.map.goal&&!t.researched;});
    if(!goal)goal=priority.map(function(id){return techs.find(function(t){return t.name===id;});}).find(function(t){return t&&!t.researched;})||techs.find(function(t){return t.unlocked&&!t.researched;});
    if(!goal)return null;
    var path=[goal],current=goal,seen={};
    while(!current.unlocked&&!seen[current.name]){seen[current.name]=true;var parent=techs.find(function(t){return !t.researched&&t.unlocks&&t.unlocks.tech&&t.unlocks.tech.includes(current.name);});if(!parent)break;path.unshift(parent);current=parent;}
    return {goal:goal,next:path[0],path:path};
  }
  function renderGoal(){
    var plan=techPlan(),flow=window.localGame.getProgression();
    objective=CatProgression.evaluate(game,bridge,plan);
    var system=flow&&CatProgression.advanced(game).find(function(s){return s.id===flow.trackedObjective;});
    if(system&&objective.id!=='active-challenge')objective={id:'system-'+system.id,stage:'高级发展方向',title:system.title,detail:system.hint,action:{type:'system',id:system.id},blockers:[]};
    if(bridge.map.goal&&game.science.techs.some(function(t){return t.name===bridge.map.goal&&!t.researched;})&&plan&&objective.id!=='active-challenge'&&!system)objective={id:'tech-'+plan.next.name,stage:'主动追踪科技',title:strip(plan.next.label),detail:'目标路线：'+plan.path.map(function(t){return strip(t.label);}).join(' → '),action:{type:'science'},blockers:CatProgression.blockers(game,bridge,'tech',plan.next.name)};
    $('goal-stage').textContent=objective.stage;
    $('goal-title').textContent=objective.title;
    $('goal-detail').textContent=objective.detail;
    $('goal-path').textContent=objective.blockers.map(function(b){return b.label;}).join('；')||'可前往对应入口继续，实际操作仍需满足原版条件。';
    var tracking=String(bridge.map.goal)+'/'+(flow&&flow.trackedObjective);
    if(previousObjective&&previousObjective.id!==objective.id&&previousTracking===tracking)$('goal-feedback').textContent='进度已更新：'+previousObjective.title+' → '+objective.title;
    previousObjective=objective;previousTracking=tracking;
    $('guidance-card').hidden=!!(flow&&flow.hidden);$('guidance-toggle').textContent=flow&&flow.hidden?'重新打开阶段引导':'收起阶段引导';$('guidance-toggle').setAttribute('aria-expanded',String(!(flow&&flow.hidden)));
    $('goal-focus').disabled=!window.localGame.canWrite();
    var select=$('goal-select'),remaining=game.science.techs.filter(function(t){return !t.researched&&t.name!=='brewery'&&(t.name!=='artificialGravity'||game.getFeatureFlag('SPACE_EXPL')||t.unlocked);}),signature=remaining.map(function(t){return t.name;}).join(',');
    if(select.dataset.signature!==signature){select.replaceChildren(new Option('按路线自动推荐',''));remaining.forEach(function(t){select.append(new Option(strip(t.label),t.name));});select.dataset.signature=signature;}
    select.value=remaining.some(function(t){return t.name===bridge.map.goal;})?bridge.map.goal:'';
  }
  function go(action){
    if(!action)return;
    if(action.type==='district')focusDistrict(action.id);
    else if(action.type==='home'){panel('district');var home=bridge.map.cells.find(function(t){return t.district==='home';});if(home)view.select(home.q,home.r);$('gather-catnip').focus();}
    else if(action.type==='science')panel('science');
    else if(action.type==='village'||action.type==='workshop')panel(action.type);
    else if(action.type==='advanced'){$('advanced-card').hidden=false;$('advanced-toggle').setAttribute('aria-expanded','true');}
    else if(action.type==='system'){try{bridge.openSystem(action.id);setMode(false);message('在原版完成操作后，点击返回地图继续。');}catch(error){message(error.message,true);}}
    else setMode(false);
  }
  function renderJourney(){
    var risk=CatProgression.risk(game),flow=window.localGame.getProgression();
    $('survival-card').hidden=!risk.active;
    if(risk.active){$('survival-detail').textContent='库存 '+number(risk.stock)+'，当前净产出 '+number(risk.rate)+'/秒。'+(risk.paused?'模拟已暂停。':'按当前速率约 '+number(risk.seconds)+' 秒后耗尽。')+'估计会随季节、天气和设施变化；检查农民岗位或增加供给。';}
    else if(foodRisk)message('当前粮食净消耗已解除，请继续关注季节变化。');
    foodRisk=risk.active;
    if(!entryShown){
      var entry=window.localGame.getEntry();if(!entry)return;
      var summary=flow&&flow.pendingRunSummary;
      if(summary&&!summary.read){$('reentry-title').textContent='本轮完成 · 开始新周目';$('reentry-detail').textContent='上一轮：第 '+summary.year+' 年，'+summary.population+' 只猫咪，'+summary.buildings+' 座建筑，'+summary.technologies+' 项科技。实际转生收益：威望 +'+summary.paragon+'；累计业力猫咪 '+summary.karmaKittens+'。新周目从当前进度继续。';}
      else{$('reentry-title').textContent='已载入'+entry.source+' · '+objective.stage;$('reentry-detail').textContent='当前第 '+entry.year+' 年，'+entry.population+' 只猫咪。'+(entry.elapsed===null?'无可比较的上次会话记录。':'距上次保存约 '+Math.floor(entry.elapsed/60000)+' 分钟；与上次保存相比，人口 '+(entry.populationChange>=0?'+':'')+entry.populationChange+'，'+entry.changes.filter(function(r){return r.value!==null;}).map(function(r){return (resource(r.name).title||r.name)+' '+(r.value>=0?'+':'')+number(r.value);}).join('，')+'。')+'下一步：'+objective.title+'。';}
      $('reentry-card').hidden=false;entryShown=true;
    }
    $('map-reset').disabled=!window.localGame.canWrite();$('advanced-reset').disabled=!window.localGame.canWrite();
  }
  function showAdvanced(){
    var systems=CatProgression.advanced(game),signature=JSON.stringify(systems.map(function(s){return [s.id,s.available];}))+window.localGame.canWrite();
    if(signature===advancedSignature)return;advancedSignature=signature;
    $('advanced-systems').replaceChildren();
    systems.forEach(function(s){var card=element('article','advanced-system');card.append(element('h3',null,s.title+(s.available?' · 已开放':' · 待开放')),element('p',null,s.hint));var open=element('button',null,s.available?'前往原版'+s.title:'查看开放条件');open.onclick=function(){go({type:'system',id:s.id});};var track=element('button',null,'追踪此方向');track.disabled=!window.localGame.canWrite();track.onclick=function(){var flow=window.localGame.getProgression();if(!window.localGame.canWrite())return;flow.trackedObjective=s.id;bridge.map.goal=null;renderGoal();};card.append(open,track);$('advanced-systems').append(card);});
  }
  function researchItems(kind){
    if(!game.bld.get('workshop').val)return [];
    return game.workshop.upgrades.filter(function(t){return t.unlocked&&!t.researched;}).map(function(t){
      var pair=bridge.research(kind,t.name),prices=pair.model.prices,missing=deficient(prices),cap=tooSmall(prices);
      return {id:t.name,title:strip(t.label),count:'已开放',description:strip(t.description),prices:pricesText(prices),status:cap.length?'容量不足：'+pricesText(cap):missing.length?'材料不足':'可以研究',actions:[{key:'research',label:'研究',disabled:missing.length>0||!pair.model.enabled,run:function(){act(function(){var result=bridge.buy(kind,t.name);message('已研究 '+strip(t.label)+'，请查看新建筑、职业和工坊升级。');return result;});}}]};
    });
  }
  function craftItems(){var amount=Number($('craft-batch').value);return game.workshop.crafts.filter(function(c){return c.unlocked&&(c.name==='wood'||game.bld.get('workshop').val>0);}).map(function(c){var prices=game.workshop.getCraftPrice(c).map(function(p){return {name:p.name,val:p.val*amount};});return {id:c.name,title:strip(c.label),count:number(resource(c.name).value),description:strip(c.description),prices:pricesText(prices),actions:[{key:'craft',label:'合成 ×'+amount,disabled:deficient(prices).length>0,run:function(){act(function(){bridge.craft(c.name,amount);});}}]};});}
  function jobItems(){return game.village.jobs.filter(function(j){return j.unlocked;}).map(function(j){return {id:j.name,title:strip(j.title),count:String(j.value)+' 只',description:strip(j.description),actions:[{key:'minus',label:'− 1',disabled:!j.value,run:function(){act(function(){bridge.job(j.name,-1);});}},{key:'plus',label:'+ 1',disabled:game.village.getFreeKittens()<1||j.value>=game.village.getJobLimit(j.name),run:function(){act(function(){bridge.job(j.name,1);});}}]};});}
  function refreshActions(){if(!game||!selectedTile)return;if(activePanel==='district')cardList('build-list',buildingItems());if(activePanel==='village'){var v=game.village;$('village-status').textContent='猫咪 '+v.getKittens()+' / 容量 '+number(game.resPool.get('kittens').maxValue)+' · 空闲 '+v.getFreeKittens()+' · 幸福度 '+Math.round(v.happiness*100)+'%';cardList('jobs-list',jobItems());}if(activePanel==='workshop'){cardList('craft-list',craftItems());cardList('upgrade-list',researchItems('upgrade'));}}
  function renderResources(){
    var base=['catnip','wood','science'],priority=['catnip','wood','minerals','science','manpower','kittens'];
    function rank(r){var index=priority.indexOf(r.name);return index<0?priority.length:index;}
    var list=game.resPool.resources.filter(function(r){return base.includes(r.name)||r.visible&&(r.unlocked||r.value>0);}).sort(function(a,b){return rank(a)-rank(b);});if(!expanded)list=list.slice(0,12);
    var container=$('live-resources');Array.from(container.children).forEach(function(row){if(!list.some(function(r){return r.name===row.dataset.key;}))row.remove();});
    list.forEach(function(r,index){var row=Array.from(container.children).find(function(n){return n.dataset.key===r.name;});if(!row){row=element('div','resource-card');row.dataset.key=r.name;row.append(element('span','resource-name'),element('span','resource-rate'),element('div','resource-value'),element('div','resource-cap'),element('meter'));container.append(row);}var rate=game.getResourcePerTick(r.name,true)*game.getTicksPerSecondUI();if(!Number.isFinite(rate))rate=0;row.querySelector('.resource-name').textContent=r.title||r.name;row.querySelector('.resource-value').textContent=number(r.value);row.querySelector('.resource-cap').textContent=r.maxValue>0?'上限 '+number(r.maxValue):'库存';row.querySelector('.resource-rate').textContent=(rate>0?'+':'')+number(rate)+'/秒';row.querySelector('.resource-rate').classList.toggle('negative',rate<0);var meter=row.querySelector('meter');meter.min=0;meter.max=Math.max(1,r.maxValue||r.value);meter.value=r.value;meter.hidden=!(r.maxValue>0);if(container.children[index]!==row)container.insertBefore(row,container.children[index]||null);});
    $('resources-more').textContent=expanded?'收起资源':'展开全部资源';
  }
  function refresh(){
    if(!view)return;bridge.sync();renderResources();renderGoal();renderJourney();
    if(!$('advanced-card').hidden)showAdvanced();
    var season=game.calendar.getCurSeason().name||'spring',signature=JSON.stringify(bridge.map.cells.map(function(t){return [t.terrain,t.district,t.count,t.limit,t.owned,t.frontier,t.building];}))+season;
    if(signature!==sceneKey||lastCells!==bridge.map.cells){sceneKey=signature;var replaced=lastCells!==bridge.map.cells;lastCells=bridge.map.cells;var previous=activePanel;view.refresh({cells:bridge.map.cells,season:season,camera:replaced?bridge.map.camera:null});if(previous!=='district')panel(previous);}
    $('building-count').textContent=number(game.bld.buildingsData.reduce(function(sum,b){return sum+(b.val||0);},0))+' 座';$('tile-count').textContent=bridge.map.cells.filter(function(t){return t.owned;}).length+' / 61 格';
    $('season-label').textContent='第 '+game.calendar.year+' 年 · '+game.calendar.getCurSeasonTitle()+' '+Math.floor(game.calendar.day)+' 日';$('population-summary').textContent='猫咪 '+game.village.getKittens()+' · 空闲 '+game.village.getFreeKittens()+' · 幸福 '+Math.round(game.village.happiness*100)+'%';
    $('map-pause').textContent=game.isPaused?'继续':'暂停';$('map-save-status').textContent=$('local-status')?$('local-status').textContent:'本地存档';
    if(selectedTile)$('tile-facts').textContent=tileFacts(selectedTile);
    if($('local-status')&&$('local-status').classList.contains('error'))message($('local-status').textContent,true);
    else if(Date.now()>noticeUntil){var food=game.getResourcePerTick('catnip',true)*game.ticksPerSecond;if(food<0){$('map-notice').textContent='粮食净产出为负，请安排农民、增加供给或控制人口。';$('map-notice').classList.add('error');}else{$('map-notice').textContent=game.isPaused?'聚落已暂停，可以继续调整分工和布局。':'实时进度已接入。选择地区建设，或按发展目标推进科技。';$('map-notice').classList.remove('error');}}
    refreshActions();if(techTree)techTree.update();
    var messages=game.console.messages||[],recent=messages.slice(0,6);$('live-log').replaceChildren();if(!recent.length)$('live-log').append(element('li',null,'营火已经点燃，聚落正在成长。'));recent.forEach(function(m){$('live-log').append(element('li',null,strip(m.text||m.message||m.msg||'')));});
  }
  function setMode(map){document.body.classList.toggle('map-mode',map);document.documentElement.classList.toggle('map-mode',map);$('hex-app').hidden=!map;$('map-return').hidden=map;game.render();if(map)refresh();}
  async function mount(){
    var ready=new Promise(function(resolve,reject){
      function receive(gamePage){try{game=gamePage;bridge=window.catMapBridge=new CatMapBridge(game,window);resolve();}catch(error){reject(error);}}
      if(window.catGameReady)receive(window.catGameReady);else window.addEventListener('catgame:ready',function(event){receive(event.detail);},{once:true});
    });
    if(classic){await ready;return;}
    var link=element('link');link.rel='stylesheet';link.href='map/style.css';document.head.append(link);
    var treeStyle=element('link');treeStyle.rel='stylesheet';treeStyle.href='map/tech-tree.css';document.head.append(treeStyle);
    var loading=element('p',null,'正在加载六角聚落…');loading.id='map-loading';document.body.append(loading);
    var response=await fetch('map/shell.html');if(!response.ok)throw new Error('无法读取地图界面。');var template=document.createElement('template');template.innerHTML=await response.text();document.body.append(template.content);$('hex-app').hidden=true;await ready;loading.remove();
    var back=element('button',null,'返回地图');back.id='map-return';back.hidden=true;back.onclick=function(){setMode(true);};document.body.append(back);
    var confirm=game.ui.confirm;game.ui.confirm=function(title,text,yes,no){if(!document.body.classList.contains('map-mode'))return confirm.apply(this,arguments);$('map-confirm-title').textContent=title||'确认操作';$('map-confirm-message').textContent=strip(text);function finish(answer){$('map-confirm').close();if(answer)yes();else if(no)no();sceneKey='';refresh();}$('map-confirm-yes').onclick=function(){finish(true);};$('map-confirm-no').onclick=function(){finish(false);};$('map-confirm').oncancel=function(event){event.preventDefault();finish(false);};$('map-confirm').showModal();};
    view=window.catMapView=createHexView({live:true,cells:bridge.map.cells,camera:bridge.map.camera,onSelect:onSelect,onCamera:function(camera){bridge.map.camera=camera;},roads:function(){return bridge.map.roads();},catCount:function(){return game.village.getKittens();}});
    document.querySelectorAll('#hex-app [data-panel]').forEach(function(b){b.onclick=function(){panel(b.dataset.panel);};});
    techTree=CatTechTree.create({game:game,bridge:bridge,number:number,canWrite:function(){return window.localGame.canWrite()&&!game.isReadOnly();},recommended:function(){var plan=techPlan();return plan&&plan.next.name;},changed:refresh,research:async function(id){bridge.guard();var result=await bridge.buy('tech',id);if(result&&result.itemBought===false)throw new Error('研究未完成：'+result.reason);message('已研究 '+strip(game.science.get(id).label)+'，新内容已同步到聚落。');refresh();}});
    $('map-tech-open').onclick=openTechTree;$('map-tech-tree').onclick=openTechTree;
    window.localGame.bindSaveInterval($('map-save-interval'));
    window.localGame.bindGameSpeed($('map-game-speed'));$('map-game-speed').addEventListener('change',refresh);
    $('map-classic').onclick=function(){setMode(false);};$('map-pause').onclick=function(){act(function(){game.togglePause();});};
    $('map-save').onclick=function(){window.localGame.save('manual').then(function(){message('进度与地图布局已经写入磁盘，并保留手动备份。');refresh();}).catch(function(error){message(error.message,true);});};$('map-save-manager').onclick=function(){$('local-manage').click();};
    $('resources-more').onclick=function(){expanded=!expanded;renderResources();};$('gather-catnip').onclick=function(){act(function(){bridge.gather();});};$('refine-wood').onclick=function(){act(function(){bridge.craft('wood',1);});};$('send-hunters').onclick=function(){act(function(){bridge.hunt();});};
    $('claim-tile').onclick=function(){act(function(){if(!bridge.map.claim(selectedTile))throw new Error('只能扩展与现有聚落相邻的土地。');message('新土地已纳入聚落，可以规划适合地形的地区。');});};
    $('assign-district').onclick=function(){act(function(){var id=$('district-kind').value;if(!bridge.map.assign(selectedTile,id))throw new Error('地形不适合，或本格仍有建筑；请先逐个拆除。');message('已在本格规划'+CatMapState.districts[id].name+'，从 0 座开始建设。其他地块保持原位。');});};
    $('clear-district').onclick=function(){act(function(){if(!bridge.map.clear(selectedTile))throw new Error('先逐个拆除本格建筑，空地才能清除地区规划。');message('本格地区规划已清除。');});};
    $('auto-layout').onclick=function(){act(function(){bridge.map.arrange();message('已将待安置建筑分配到现有地区空位，原有地块保持原位。');});};$('map-reset').onclick=function(){game.reset();};
    $('goal-select').onchange=function(){if(!window.localGame.canWrite())return;bridge.map.goal=$('goal-select').value||null;window.localGame.getProgression().trackedObjective=null;renderGoal();refreshActions();};$('goal-focus').onclick=function(){go(objective.blockers.length?objective.blockers[0].action:objective.action);};
    $('guidance-toggle').onclick=function(){var flow=window.localGame.getProgression();window.localGame.hideGuidance(!flow.hidden);renderGoal();};
    $('advanced-toggle').onclick=function(){$('advanced-card').hidden=!$('advanced-card').hidden;this.setAttribute('aria-expanded',String(!$('advanced-card').hidden));showAdvanced();};
    $('advanced-auto').onclick=function(){if(!window.localGame.canWrite())return;window.localGame.getProgression().trackedObjective=null;bridge.map.goal=null;renderGoal();};
    $('advanced-reset').onclick=function(){game.reset();};
    $('survival-jobs').onclick=function(){panel('village');};$('survival-fields').onclick=function(){focusDistrict('agriculture');};
    $('reentry-dismiss').onclick=function(){window.localGame.dismissSummary().then(function(){$('reentry-card').hidden=true;}).catch(function(error){message(error.message,true);});};
    ['build-batch','craft-batch'].forEach(function(id){$(id).onchange=refreshActions;});
    setMode(true);refresh();setInterval(refresh,1000);
  }
  function start(){mount().catch(function(error){console.error(error);var loading=$('map-loading');if(loading){loading.textContent='地图未能加载：'+error.message+'。';var fallback=element('a',null,'打开原版界面');fallback.href='?view=classic';loading.append(fallback);}else message(error.message,true);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
}());
