(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatProgression=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function text(value){return String(value||'').replace(/<[^>]*>/g,'');}
  function metadata(raw){
    raw=raw&&raw.version===1?raw:{};
    var summary=raw.pendingRunSummary,base=raw.baseline;
    var validSummary=summary&&typeof summary.id==='string'&&['year','population','paragon','karmaKittens','buildings','technologies'].every(function(k){return Number.isFinite(summary[k]);});
    return {version:1,hidden:raw.hidden===true,trackedObjective:typeof raw.trackedObjective==='string'?raw.trackedObjective:null,pendingRunSummary:validSummary?Object.assign({},summary,{read:summary.read===true}):null,baseline:base&&Number.isFinite(base.at)&&Number.isFinite(base.population)&&Array.isArray(base.resources)?base:null};
  }
  function baseline(game,now){return {at:now,year:game.calendar.year,population:game.village.getKittens(),resources:['catnip','wood','science'].map(function(id){return {name:id,value:game.resPool.get(id).value};})};}
  function reentry(game,previous,source,now){
    var current=baseline(game,now),valid=previous&&now>=previous.at;
    return {source:source,elapsed:valid?now-previous.at:null,year:current.year,population:current.population,populationChange:valid&&Number.isFinite(previous.population)?current.population-previous.population:null,changes:valid?current.resources.map(function(r){var old=(previous.resources||[]).find(function(p){return p.name===r.name&&Number.isFinite(p.value);});return {name:r.name,value:old?r.value-old.value:null};}):[]};
  }
  function risk(game){
    var food=game.resPool.get('catnip'),rate=game.getResourcePerTick('catnip',true)*game.getTicksPerSecondUI();
    return {active:rate<0,stock:food.value,rate:rate,paused:!!game.isPaused,seconds:rate<0&&!game.isPaused?Math.max(0,food.value)/-rate:null,zeroPopulation:game.village.getKittens()===0};
  }
  var systems=[
    {id:'trade',title:'贸易',tab:'Trade',hint:'发现贸易种族后开放；在原版贸易页探索和交易。'},
    {id:'religion',title:'宗教',tab:'Religion',hint:'获得信仰后开放；无神论挑战中需建造通灵塔。在原版宗教页进行赞美与仪式。'},
    {id:'space',title:'太空',tab:'Space',hint:'研究火箭学等前置科技；在原版太空页执行任务。'},
    {id:'policy',title:'政策',tab:'Science',hint:'在科学页查看政策；政策还有各自的前置与互斥条件。'},
    {id:'workshop',title:'工程师生产',tab:'Workshop',hint:'建设并开启工坊后开放；在原版工坊选择工程师的加工配方。'},
    {id:'time',title:'时间',tab:'Time',hint:'研究日历后开放，或拥有已使用的冷冻舱；在原版时间页管理时间设施。'},
    {id:'challenges',title:'挑战',tab:'Challenges',hint:'解锁威望升级「调整局」后在挑战页选择规则；开启挑战可能触发转生。'}
  ];
  function advanced(game){return systems.map(function(s){var tab=game.tabs.find(function(t){return t.tabId===s.tab;}),available=!!(tab&&tab.visible);if(s.id==='policy')available=available&&game.science.policies.some(function(p){return p.unlocked;});return Object.assign({},s,{available:available});});}
  function openSystem(game,id){var s=advanced(game).find(function(s){return s.id===id;});if(!s||!s.available)throw new Error(s?s.hint:'请在原版界面查看操作说明。');game.ui.activeTabId=s.tab;game.render();if(id==='policy'&&game.libraryTab.policyPanel){game.libraryTab.policyPanel.collapse(false);}return s;}
  function craftPath(game,name,seen){
    seen=seen||[];
    if(seen.includes(name))return {cycle:true,labels:[]};
    var recipe=game.workshop.crafts.find(function(c){return c.name===name&&c.unlocked;}),labels=[],cycle=false;
    if(!recipe)return {cycle:false,labels:[]};
    game.workshop.getCraftPrice(recipe).forEach(function(p){
      if(game.resPool.get(p.name).value>=p.val)return;
      labels.push(game.resPool.get(p.name).title||p.name);
      var child=craftPath(game,p.name,seen.concat(name));labels=labels.concat(child.labels);cycle=cycle||child.cycle;
    });
    return {cycle:cycle,labels:Array.from(new Set(labels))};
  }
  function blockers(game,bridge,kind,id){
    var pair=kind==='building'?bridge.building(id):bridge.research('tech',id),model=pair.model,meta=model.metadata,result=[];
    function add(type,label,action){result.push({type:type,label:label,action:action});}
    if(!meta.unlocked||model.visible===false)add('unlock','前置尚未开放：请查看原版说明或科技树。',{type:'science'});
    (model.prices||[]).forEach(function(p){var r=game.resPool.get(p.name);if(r.value<p.val&&r.maxValue>0&&r.maxValue<p.val)add('capacity',(r.title||p.name)+'容量不足',{type:'district',id:p.name==='science'?'science':'storage'});});
    if(kind==='building'){
      var group=bridge.map.groups[id]&&bridge.map.groups[id].district;
      if(group&&!bridge.map.cells.some(function(t){return t.owned&&t.district===group&&bridge.map.free(t)>0;})){
        var space=bridge.map.cells.some(function(t){return !t.district&&(t.owned||t.frontier)&&bridge.map.suitable(t,group);});
        add('land',space?'目标地区没有空槽位，请规划合适的地块。':'没有可用的合适地块；检查槽位、拆除或待安置建筑，地图并非无限扩张。',{type:'district',id:group});
      }
    }
    (model.prices||[]).forEach(function(p){
      var r=game.resPool.get(p.name);if(r.value+1e-8>=p.val)return;
      var craft=game.workshop.crafts.find(function(c){return c.name===p.name&&c.unlocked;}),action=p.name==='catnip'||p.name==='wood'?{type:'home'}:{type:craft?'workshop':'village'};
      var label=(r.title||p.name)+'还缺 '+Math.ceil(p.val-r.value)+(p.name==='wood'?'，可在营火精炼':craft?'，可在工坊合成':'，检查生产岗位或继续积累');
      if(craft){var path=craftPath(game,p.name);if(path.cycle){label+='；配方依赖循环，请查看原版说明';action={type:'classic'};}else if(path.labels.length)label+='；先补充原料：'+path.labels.join('、');}
      add(craft?'craft':'stock',label,action);
    });
    if(!result.length&&!model.enabled)add('condition','还有原版条件未满足，请查看原版对应操作。',{type:'classic'});
    return result;
  }
  function evaluate(game,bridge,plan){
    function b(id){return game.bld.get(id).val>0;}
    function researched(id){return game.science.get(id).researched;}
    function job(id){return game.village.getJob(id).value>0;}
    function objective(id,stage,title,detail,action,kind,target){return {id:id,stage:stage,title:title,detail:detail,action:action,blockers:kind?blockers(game,bridge,kind,target):[]};}
    function build(id,stage,title,group){return objective('build-'+id,stage,title,'在对应地区建设，费用和解锁由原版规则决定。',{type:'district',id:group},'building',id);}
    var active=game.challenges.challenges.filter(function(c){return c.active&&c.name!=='ironWill';});
    if(active.length)return objective('active-challenge','挑战进行中','按挑战规则继续发展',active.map(function(c){return text(c.label)+': '+text(c.description);}).join('；'),{type:'system',id:'challenges'});
    if(!b('field')){
      if(game.resPool.get('catnip').value<10)return objective('gather','营火与供给','采集猫薄荷，点燃聚落生活','在营火点击采集猫薄荷，积累第一块田的投入。',{type:'home'});
      return objective('first-field','营火与供给','建设第一块田','前往农业区建设，让食物开始持续生产。',{type:'district',id:'agriculture'},'building','field');
    }
    if(!b('hut')&&!b('logHouse')&&!b('mansion'))return build('hut','聚落与人口','精炼木材，建设住房','housing');
    if(!game.village.getKittens())return objective('population','聚落与人口','恢复供给，等待猫咪迁入','检查粮食与空余住房；人口归零后仍可以继续经营。',{type:'village'});
    if(!b('library'))return build('library','科学与分工','建设图书馆','science');
    if(game.village.getKittens()>0&&!job('scholar')&&game.getResourcePerTick('science',true)<=0)return objective('scholars','科学与分工','安排学者，建立科学来源','在村庄释放旧岗位，再安排学者；研究仍需达到科学容量。',{type:'village'});
    if(researched('agriculture')&&game.village.getKittens()>0&&!job('farmer')&&game.getResourcePerTick('catnip',true)<0)return objective('farmers','科学与分工','安排农民，稳定供粮','农业已开放农民；调整岗位后检查季节下的实际粮食净产出。',{type:'village'});
    if(researched('mining')&&!b('mine'))return build('mine','工坊与工业','把采矿科技落实为矿井','mining');
    if(b('mine')&&game.village.getKittens()>0&&!job('miner')&&game.getResourcePerTick('minerals',true)<=0)return objective('miners','工坊与工业','安排矿工，生产矿物','已有矿井；前往村庄安排矿工，建立材料来源。',{type:'village'});
    if(researched('mining')&&!b('workshop'))return build('workshop','工坊与工业','建设工坊，开放材料加工','industry');
    if(researched('metal')&&!b('smelter'))return build('smelter','工坊与工业','建设冶炼厂，开始金属生产','industry');
    if(researched('mechanization')&&!b('factory'))return build('factory','工坊与工业','建设工厂，落实机械化','industry');
    if(b('factory')&&game.village.getKittens()>0&&!job('engineer'))return objective('engineers','工坊与工业','安排工程师并选择生产配方','在村庄安排工程师，再前往原版工坊分配工程师配方。',{type:'system',id:'workshop'});
    if(plan)return objective('tech-'+plan.next.name,'科技发展',text(plan.next.label),'研究后继续落实对应建筑、岗位和材料生产。',{type:'science'},'tech',plan.next.name);
    return objective('branches','高级发展与周目','选择下一条文明发展方向','科技路线不是终点。可继续太空、信仰、时间、挑战，或查看本轮转生收益。',{type:'advanced'});
  }
  function preview(game){var p=game.getResetPrestige();return {year:game.calendar.year,population:game.village.getKittens(),paragon:p.paragonPoints,paragonBefore:game.resPool.get('paragon').value,karmaKittens:p.karmaKittens,buildings:game.bld.buildingsData.reduce(function(n,b){return n+b.val;},0),technologies:game.science.techs.filter(function(t){return t.researched;}).length,details:'重置：本轮建筑、地图规划与通常的科技和岗位。保留：业力、威望、成就等原版永久进度。时空球、冷冻舱、永恒时学、通量冷凝器和挑战规则可能改变资源、猫咪与科技保留；以原版结算为准。转生与删档是不同操作。'};}
  return {metadata:metadata,baseline:baseline,reentry:reentry,risk:risk,advanced:advanced,openSystem:openSystem,blockers:blockers,evaluate:evaluate,preview:preview};
}));
