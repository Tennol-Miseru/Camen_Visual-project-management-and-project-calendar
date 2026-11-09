/* Camen lightweight UI enhancements. Existing storage schema is unchanged. */
(function (ns) {
  'use strict';
  const SKINS = [
    ['white','清透白','#f7f8fc','#ffffff','#665de7'],
    ['mint','薄荷绿','#f2faf6','#ffffff','#278d79'],
    ['peach','暖杏粉','#fcf7f2','#fffdfb','#bb7154'],
    ['sky','浅海蓝','#f3f8fe','#ffffff','#3e84c9'],
    ['rose','樱花粉','#fdf6f9','#ffffff','#bf648b'],
    ['sand','奶油沙','#faf8f1','#fffefa','#a97c45'],
    ['black','深夜蓝','#111421','#1b2032','#aaa3ff'],
    ['gray','柔雾灰','#222633','#2e3342','#8a8bd8'],
    ['forest','松林夜','#111e1b','#1a2c26','#78bda0'],
    ['midnight','午夜蓝','#0c1527','#172238','#7caafc']
  ];
  const COLORS = [
    '#665de7','#a27beb','#dd7fae','#e76f7a','#ea9274','#e9b35e','#a9ac50','#5faa7b',
    '#39a99c','#4ca9bd','#4a8bd6','#7d98c4','#66748d','#9b8176','#b15b5b','#596b68'
  ];
  const colorPattern = /^#[0-9a-fA-F]{6}$/;
  const $ = (sel, root=document) => root.querySelector(sel);
  const textDate = date => `${Number(date.slice(5,7))}月${Number(date.slice(8))}日`;
  function init(ctx) {
    const grid = $('#skin-grid');
    const select = $('#theme-select');
    const buttonMap = new Map();
    SKINS.forEach(([id,label,bg,panel,accent]) => {
      const button = document.createElement('button');
      button.type='button'; button.className='skin-button';
      button.setAttribute('aria-label', `${label}皮肤`);
      button.innerHTML='<span class="skin-swatch" aria-hidden="true"><i></i><i></i></span><span></span>';
      button.querySelector('.skin-swatch').style.cssText=`--skin-bg:${bg};--skin-panel:${panel};--skin-accent:${accent}`;
      button.lastElementChild.textContent=label;
      button.addEventListener('click', () => {
        ns.actions.applyTheme(ctx,id);
        ctx.storage.save('calendar_theme',id);
        if (select) select.value=id;
      });
      buttonMap.set(id,button);
      grid?.append(button);
    });
    const syncSkin = () => {
      const current=document.body.dataset.theme||'white';
      buttonMap.forEach((button,id)=>button.setAttribute('aria-pressed',String(id===current)));
    };
    const originalApplyTheme=ns.actions.applyTheme;
    ns.actions.applyTheme=function(c,name){originalApplyTheme(c,name);syncSkin();};
    select?.addEventListener('change',syncSkin);
    syncSkin();

    const buildColorPicker = (input) => {
      if (!input || input.dataset.enhanced==='true') return;
      const label=input.closest('label');
      if (!label) return;
      input.dataset.enhanced='true';
      const wrap=document.createElement('div');
      wrap.className='color-choice';
      const swatches=document.createElement('div');
      swatches.className='color-presets';
      const buttons=[];
      const update=()=>{
        const value=(input.value||'').toLowerCase();
        buttons.forEach(button=>{
          const active=button.dataset.value===value;
          button.setAttribute('aria-pressed',String(active));
          button.textContent=active?'✓':'';
        });
        hex.value=value;
      };
      const choose=(color)=>{
        input.value=color;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        // A deliberate color choice overrides automatic project color inheritance.
        const parentForm=input.closest('form');
        const linked=parentForm?.querySelector('#use-project-color-modal, #use-project-color');
        if (linked) linked.checked=false;
        update();
      };
      COLORS.forEach(color=>{
        const btn=document.createElement('button');
        btn.type='button';btn.className='color-swatch';btn.style.setProperty('--swatch',color);
        btn.dataset.value=color;
        btn.title=`选择 ${color}`;btn.setAttribute('aria-label',`选择颜色 ${color}`);
        btn.addEventListener('click',()=>choose(color));
        buttons.push(btn);swatches.append(btn);
      });
      const custom=document.createElement('button');
      custom.type='button';custom.className='color-custom-link';custom.textContent='＋ 自定义颜色';
      custom.title='自定义十六进制颜色';custom.setAttribute('aria-label','自定义颜色');
      const extra=document.createElement('div');extra.className='color-extra';extra.hidden=true;
      extra.innerHTML='<span>自定义 HEX</span>';
      const hex=document.createElement('input');
      hex.type='text';hex.maxLength=7;hex.placeholder='#665de7';hex.setAttribute('aria-label','自定义十六进制颜色');
      hex.style.cssText='width:112px;min-height:31px;padding:5px 9px;font-size:12px';
      extra.append(hex);
      const applyHex=()=>{const value=hex.value.trim(); if(colorPattern.test(value)) {choose(value.toLowerCase());hex.setCustomValidity('');} else {hex.setCustomValidity('请输入 #RRGGBB 格式');hex.reportValidity();}};
      hex.addEventListener('change',applyHex);
      hex.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyHex();}});
      custom.addEventListener('click',()=>{extra.hidden=!extra.hidden;if(!extra.hidden){hex.value=input.value;hex.focus();hex.select();}});
      input.addEventListener('change',update);
      wrap.append(swatches,custom,extra);
      input.insertAdjacentElement('afterend',wrap);
      update();
      // Honor automatic inheritance whenever the associated project changes.
      const form=input.closest('form');
      const project=form?.querySelector('[name="projectId"]');
      if (input.name==='color' && project) {
        project.addEventListener('change',()=>{
          if(project.value && !form.querySelector('[id^="task-id"]')?.value) {
            const checkbox=form.querySelector('#use-project-color-modal,#use-project-color');
            if(checkbox) checkbox.checked=true;
            input.value=ns.actions.getProjectColor(ctx,project.value);
          }
          update();
        });
      }
    };
    const enhanceColors=(scope)=>scope.querySelectorAll('input[type="color"]').forEach(buildColorPicker);
    enhanceColors(document);
    const modalBody=$('#editor-modal-body');
    if (modalBody) new MutationObserver(()=>enhanceColors(modalBody)).observe(modalBody,{childList:true});

    // Date shortcuts: one click on an empty date, with prefilled start/end.
    const showNewForDate=(iso)=>{
      if (ctx.state.editorMode !== 'modal') ns.actions.applyEditorMode(ctx,'modal');
      ns.bindings.openTaskEditorModal(ctx);
      const form=$('#task-form-modal');
      if(!form) return;
      const start=form.elements.namedItem('start');const end=form.elements.namedItem('end');
      if(start) start.value=iso;
      if(end) end.value=iso;
      form.elements.namedItem('title')?.focus();
    };
    const dayOverlay=$('#day-overlay'), dayItems=$('#day-items');
    let activeDate='';
    const closeDay=()=>{if(dayOverlay)dayOverlay.hidden=true;};
    const openDay=(date)=>{
      activeDate=date;
      $('#day-heading').textContent=`${textDate(date)} · 日程`;
      dayItems.replaceChildren();
      const relevant=ns.tasks.visibleTasks(ctx).filter(ns.tasks.isValidTask).filter(t=>date>=t.start&&date<=t.end);
      if(!relevant.length){ const empty=document.createElement('div');empty.className='day-empty';empty.textContent='这一天没有安排';dayItems.append(empty); }
      relevant.forEach(t=>{
        const item=document.createElement('button');item.type='button';item.className='day-item';
        item.style.setProperty('--task-color',colorPattern.test(t.color||'')?t.color:'#665de7');
        const dot=document.createElement('span');dot.className='day-item-dot';
        const content=document.createElement('span');
        const title=document.createElement('b');title.textContent=t.title;
        const meta=document.createElement('small');meta.textContent=ns.actions.getProjectName(ctx,t.projectId)||'未分配工程';
        content.append(title,meta);
        const arrow=document.createElement('span');arrow.textContent='›';arrow.setAttribute('aria-hidden','true');
        item.append(dot,content,arrow);
        item.addEventListener('click',()=>{closeDay();ns.actions.startEditTask(ctx,t);});
        dayItems.append(item);
      });
      dayOverlay.hidden=false;
    };
    $('#day-close')?.addEventListener('click',closeDay);
    dayOverlay?.addEventListener('click',e=>{if(e.target===dayOverlay)closeDay();});
    $('#day-add')?.addEventListener('click',()=>{closeDay();showNewForDate(activeDate);});
    const calendar=$('#calendar-grid');
    calendar?.addEventListener('click',e=>{
      if(e.target.closest('.task-chip,.day-more')) return;
      const cell=e.target.closest('.day[data-date]');
      if(!cell)return;
      const date=cell.dataset.date;
      if(window.matchMedia('(max-width:620px)').matches) openDay(date);
      else showNewForDate(date);
    });
    calendar?.addEventListener('keydown',e=>{
      if(e.target.matches('.day[data-date]') && (e.key==='Enter'||e.key===' ')) {
        e.preventDefault();
        if(window.matchMedia('(max-width:620px)').matches) openDay(e.target.dataset.date);
        else showNewForDate(e.target.dataset.date);
      }
    });

    // Fresh forms should not force the user to fill both date fields.
    const prepareForm=(form)=>{
      if(!form) return;
      const start=form.elements.namedItem('start'),end=form.elements.namedItem('end');
      if(!start||!end)return;
      if(!start.value)start.value=ns.core.toDateStrLocal(new Date());
      if(!end.value)end.value=start.value;
      let previousStart=start.value;
      start.addEventListener('change',()=>{
        if(!end.value || end.value===previousStart || end.value<start.value)end.value=start.value;
        previousStart=start.value;
      });
      const isProjectForm=Boolean(form.elements.namedItem('projectColor'));
      if(isProjectForm && !form.elements.namedItem('projectId')?.value){
        const colorInput=form.elements.namedItem('projectColor');
        const used=new Set(ctx.state.projects.map(p=>(p.color||'').toLowerCase()));
        const next=COLORS.find(color=>!used.has(color))||COLORS[ctx.state.projects.length%COLORS.length];
        if(colorInput){colorInput.value=next;colorInput.dispatchEvent(new Event('change',{bubbles:true}));}
      }
    };
    // Original editor HTML is re-created each time; run preparation after its synchronous binding.
    const originalTaskModal=ns.bindings.openTaskEditorModal;
    ns.bindings.openTaskEditorModal=function(c,task){originalTaskModal(c,task);prepareForm($('#task-form-modal'));};
    const originalProjectModal=ns.bindings.openProjectEditorModal;
    ns.bindings.openProjectEditorModal=function(c,project){originalProjectModal(c,project);prepareForm($('#project-form-modal'));};

    const fireworksToggle=$('#fireworks-toggle');
    const saved=ctx.storage.load('camen_click_fireworks',true);
    if(fireworksToggle) fireworksToggle.checked=saved!==false;
    fireworksToggle?.addEventListener('change',()=>ctx.storage.save('camen_click_fireworks',fireworksToggle.checked));
    let lastPop=0;
    document.addEventListener('click',event=>{
      if(!fireworksToggle?.checked || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if(event.isTrusted===false) return;
      if(event.clientX===0&&event.clientY===0)return;
      if(event.target.closest('input,textarea,select,.day-more'))return;
      if(document.hidden)return;
      const now=performance.now();if(now-lastPop<90)return;lastPop=now;
      const root=document.createElement('span');root.className='click-firework';root.style.left=event.clientX+'px';root.style.top=event.clientY+'px';
      const palette=[getComputedStyle(document.body).getPropertyValue('--accent-solid').trim()||'#665de7','#e9b35e','#ed8d99','#78cbb8'];
      for(let i=0;i<8;i++){
        const particle=document.createElement('i');
        const angle=(Math.PI*2*i)/8+(Math.random()-.5)*.18;
        const radius=13+Math.random()*14;
        particle.style.setProperty('--tx',Math.cos(angle)*radius+'px');
        particle.style.setProperty('--ty',Math.sin(angle)*radius+'px');
        particle.style.setProperty('--particle-color',palette[i%palette.length]);
        particle.style.animationDelay=i%3*12+'ms';
        root.append(particle);
      }
      document.body.append(root);
      root.addEventListener('animationend',()=>root.remove(),{once:true});
      setTimeout(()=>root.remove(),750);
    },true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDay();});
  }
  ns.delight={init};
  document.addEventListener('DOMContentLoaded',()=>{
    // app.js registers initialization earlier, so the context is provided by an interception.
  });
})(window.CamenCalendar=window.CamenCalendar||{});
