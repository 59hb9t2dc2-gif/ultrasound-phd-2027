(() => {
  'use strict';

  let data = window.APP_DATA || { meta:{}, profile:{}, schools:[], advisors:[], admissions:[], sources:[], sourceStatus:{}, timeline:[], materials:[] };
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const storage = {
    get(key, fallback){ try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } },
    set(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  };
  const KEYS = { fav:'usphd_favorites', tracker:'usphd_tracker', materials:'usphd_materials' };
  let currentSection = 'dashboard';
  let advisorFilters = {};
  let noticeFilters = {};
  let schoolFilters = {};

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'zh-CN'));
  const textIncludes = (haystack, needle) => !needle || String(haystack ?? '').toLowerCase().includes(String(needle).toLowerCase());
  const join = value => Array.isArray(value) ? value.join('、') : (value || '未公开');
  const tierClass = tier => tier === '匹配' ? 'success' : tier === '冲刺' ? 'primary' : tier === '暂不建议' ? 'warning' : 'neutral';
  const sourceStatusClass = status => status === 'ok' ? 'ok' : status === 'limited' ? 'limited' : status === 'error' ? 'error' : 'waiting';
  const formatDate = value => {
    if (!value) return '未公开';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    return s;
  };
  const compareNotice = (a,b) => String(b.publish_date || '').localeCompare(String(a.publish_date || '')) || String(b.title).localeCompare(String(a.title),'zh-CN');
  const toast = msg => { const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2600); };

  async function loadRemoteData(showMessage=false){
    if (!['http:','https:'].includes(location.protocol)) {
      if (showMessage) toast('当前是本地离线快照；部署到 GitHub Pages 后才能读取每日自动更新的数据。');
      return false;
    }
    const files = {
      schools:'data/schools.json', advisors:'data/advisors.json', admissions:'data/admissions.json',
      sources:'data/sources.json', sourceStatus:'data/source_status.json', timeline:'data/application_timeline.json',
      profile:'data/profile.json', materials:'data/materials.json'
    };
    try {
      const entries = await Promise.all(Object.entries(files).map(async ([key,url]) => {
        const resp = await fetch(`${url}?t=${Date.now()}`, { cache:'no-store' });
        if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
        return [key, await resp.json()];
      }));
      Object.assign(data, Object.fromEntries(entries));
      data.meta = { ...(data.meta||{}), updated_at: data.sourceStatus?.last_checked || new Date().toISOString() };
      renderAll();
      if (showMessage) toast('已读取仓库中的最新数据。');
      return true;
    } catch (err) {
      console.error(err);
      if (showMessage) toast('在线数据读取失败，已保留当前快照。');
      return false;
    }
  }

  function initNavigation(){
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.section)));
    $$('[data-jump]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.jump)));
    $('#mobileMenuBtn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  }

  function navigate(section){
    currentSection = section;
    $$('.page-section').forEach(s => s.classList.toggle('active', s.id===section));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.section===section));
    const active = $(`.nav-item[data-section="${section}"]`);
    $('#pageTitle').textContent = active ? active.textContent.trim() : '超声申博库';
    document.body.classList.remove('menu-open');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function setMode(){
    const badge = $('#modeBadge');
    const online = ['http:','https:'].includes(location.protocol);
    badge.textContent = online ? '在线自动更新模式' : '本地离线快照';
    badge.className = `status-pill ${online ? 'live' : 'offline'}`;
    const updated = data.sourceStatus?.last_checked || data.meta?.updated_at || '未记录';
    $('#lastUpdated').textContent = `数据更新时间：${formatDate(updated)} · 目标2027级`;
  }

  function renderDashboard(){
    const advisors = data.advisors || [], schools = data.schools || [], admissions = data.admissions || [];
    const sourceSummary = data.sourceStatus?.summary || {};
    const newCount = admissions.filter(n=>n.is_new).length;
    const highMatch = advisors.filter(a=>a.match_score>=85).length;
    const catalogConfirmed = advisors.filter(a=>/2026.*(目录|可招生|招生)/.test(a.coverage_class||'')).length;
    const officialPending = advisors.filter(a=>/(官方.*博导|官方博士生导师|官方学博|官方专博|培养记录)/.test(a.coverage_class||'') && !/历史/.test(a.coverage_class||'')).length;
    const stats = [
      ['培养单位', schools.length, '全国扩展核验与监控清单'],
      ['已收录导师', advisors.length, `${catalogConfirmed}位年度目录明确 · ${officialPending}位官方博导待确认`],
      ['招生动态', admissions.length, `${newCount}条标记为新发现`],
      ['自动监控入口', data.sources?.length || 0, sourceSummary.ok ? `${sourceSummary.ok}个本次可访问` : '部署后每日检查']
    ];
    $('#statCards').innerHTML = stats.map((s,i)=>`<article class="stat-card"><span class="stat-label">${esc(s[0])}</span><strong class="${i===1?'accent':''}">${esc(s[1])}</strong><small>${esc(s[2])}</small></article>`).join('');

    const p = data.profile || {};
    const profileItems = [
      ['学历/单位', `${p.degree||''} · ${p.institution||''}`], ['毕业时间', p.graduation], ['研究方向', p.research],
      ['论文情况', p.publications], ['英语', p.english], ['临床资质', p.clinical],
      ['申请偏好', join(p.preferences)], ['职业目标', join(p.goals)], ['核心差异化', '纳米材料 + 超声触发治疗 + 临床超声背景']
    ];
    $('#profileCard').innerHTML = profileItems.map(([k,v])=>`<div class="profile-item"><span>${esc(k)}</span><strong>${esc(v||'未填写')}</strong></div>`).join('');

    const no2027 = !admissions.some(n=>Number(n.year)===2027);
    const alerts = [
      no2027 && ['2027政策尚未集中发布','当前页面展示2026年已核验政策，并自动监控2027简章、目录和导师资格。'],
      ['论文竞争力仍需加强','顶级平台通常更重视高水平第一作者成果；优先推动在投论文接收或形成可证明的阶段成果。'],
      ['全国口径需要分层理解','全国没有统一实时博导总目录；本库区分年度目录明确、官方博导待确认、历史目录和交叉方向，不能把所有收录者视为2027可报。'],
      ['名额不能从导师主页推断','导师有博导资格不等于2027一定招生，必须以年度目录和导师回复为准。'],
      ['学位类型需优先核对','工程/材料类学博科研匹配度高，但可能影响三甲超声临床岗位的学历专业匹配。']
    ].filter(Boolean);
    $('#riskAlerts').innerHTML = alerts.map(([h,p])=>`<div class="alert-item"><div class="alert-icon">!</div><div><h4>${esc(h)}</h4><p>${esc(p)}</p></div></div>`).join('');

    const top = [...advisors].sort((a,b)=>b.match_score-a.match_score).slice(0,6);
    $('#topMatches').innerHTML = top.map(a=>`<div class="match-row"><div class="score-bubble" style="--score:${a.match_score}"><strong>${a.match_score}</strong></div><div><h4>${esc(a.name)} · ${esc(a.hospital||a.school)}</h4><p>${esc((a.research_tags||[]).slice(0,3).join(' / '))}</p></div><span class="tag ${tierClass(a.tier)}">${esc(a.tier)}</span></div>`).join('');

    $('#latestNotices').innerHTML = [...admissions].sort(compareNotice).slice(0,7).map(renderNoticeItem).join('');
  }

  function renderNoticeItem(n){
    return `<div class="notice-item"><div class="notice-meta"><span>${esc(formatDate(n.publish_date))}</span><span>·</span><span>${esc(n.school)}</span>${n.is_new?'<span class="new-badge">新</span>':''}</div><h4><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h4></div>`;
  }

  function populateFilters(){
    setSelectOptions('#noticeSchoolFilter', uniq((data.admissions||[]).map(x=>x.school)), '全部院校');
    setSelectOptions('#noticeTypeFilter', uniq((data.admissions||[]).map(x=>x.type)), '全部类型');
    setSelectOptions('#noticeYearFilter', uniq((data.admissions||[]).map(x=>String(x.year))), '全部年份');
    setSelectOptions('#advisorProvinceFilter', uniq((data.advisors||[]).map(x=>x.province)), '全部地区');
    setSelectOptions('#advisorCoverageFilter', uniq((data.advisors||[]).map(x=>x.coverage_class)), '全部核验层级');
    setSelectOptions('#advisorTierFilter', uniq((data.advisors||[]).map(x=>x.tier)), '全部档位');
    setSelectOptions('#advisorDegreeFilter', ['学博','专博'], '专博/学博不限');
    setSelectOptions('#advisorProgramFilter', uniq((data.advisors||[]).map(x=>[x.program_code,x.program_name].filter(Boolean).join(' '))), '全部招生专业');
    setSelectOptions('#advisorTagFilter', uniq((data.advisors||[]).flatMap(x=>x.research_tags||[])), '全部研究方向');
    setSelectOptions('#schoolProvinceFilter', uniq((data.schools||[]).map(x=>x.province)), '全部地区');
    setSelectOptions('#schoolTierFilter', uniq((data.schools||[]).map(x=>x.tier)), '全部匹配档位');
    setSelectOptions('#schoolStatusFilter', uniq((data.schools||[]).map(x=>x.status)), '全部核验状态');
  }

  function setSelectOptions(selector, values, placeholder){
    const el=$(selector); if(!el) return;
    const current=el.value;
    el.innerHTML = `<option value="">${esc(placeholder)}</option>` + values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(values.includes(current)) el.value=current;
  }

  function renderAdmissions(){
    const q = ($('#noticeSearch').value||'').trim();
    const school = $('#noticeSchoolFilter').value, type=$('#noticeTypeFilter').value, year=$('#noticeYearFilter').value, onlyNew=$('#noticeNewOnly').checked;
    noticeFilters={q,school,type,year,onlyNew};
    const rows=[...(data.admissions||[])].filter(n =>
      (!q || textIncludes(`${n.school} ${n.title} ${n.type}`,q)) && (!school||n.school===school) && (!type||n.type===type) && (!year||String(n.year)===year) && (!onlyNew||n.is_new)
    ).sort(compareNotice);
    $('#admissionTable').innerHTML=rows.map(n=>`<tr><td>${esc(formatDate(n.publish_date))}${n.is_new?'<br><span class="new-badge">首次发现</span>':''}</td><td><strong>${esc(n.school)}</strong></td><td><span class="tag neutral">${esc(n.type)}</span></td><td><a class="link-title" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></td><td>${esc(n.year)}</td><td><span class="tag ${n.source_level==='A'?'success':'warning'}">${esc(n.source_level||'待核实')}</span><br><a class="source-link" href="${esc(n.url)}" target="_blank" rel="noopener">打开官网</a></td></tr>`).join('');
    $('#admissionEmpty').classList.toggle('hidden',rows.length>0);
  }

  function getFavorites(){ return storage.get(KEYS.fav,[]); }
  function toggleFavorite(id){
    const fav=new Set(getFavorites()); fav.has(id)?fav.delete(id):fav.add(id); storage.set(KEYS.fav,[...fav]);
    renderAdvisors(); renderTracker(); renderRanking();
  }

  function filteredAdvisors(){
    const q=($('#advisorSearch').value||'').trim(), province=$('#advisorProvinceFilter').value, coverage=$('#advisorCoverageFilter').value, tier=$('#advisorTierFilter').value, degree=$('#advisorDegreeFilter').value, program=$('#advisorProgramFilter').value, tag=$('#advisorTagFilter').value, score=Number($('#advisorScoreFilter').value||60), favOnly=$('#favoritesOnly').checked;
    advisorFilters={q,province,coverage,tier,degree,program,tag,score,favOnly};
    const fav=new Set(getFavorites());
    return [...(data.advisors||[])].filter(a => {
      const corpus=[a.name,a.school,a.hospital,a.department,a.research_summary,a.coverage_class,a.admission_track,a.program_code,a.program_name,a.program_direction,...(a.research_tags||[])].join(' ');
      return (!q||textIncludes(corpus,q)) && (!province||a.province===province) && (!coverage||a.coverage_class===coverage) && (!tier||a.tier===tier) && (!degree||join(a.degree_types).includes(degree)) && (!program||[a.program_code,a.program_name].filter(Boolean).join(' ')===program) && (!tag||(a.research_tags||[]).includes(tag)) && a.match_score>=score && (!favOnly||fav.has(a.id));
    }).sort((a,b)=>b.match_score-a.match_score || String(a.name).localeCompare(String(b.name),'zh-CN'));
  }

  function renderAdvisors(){
    const rows=filteredAdvisors(), fav=new Set(getFavorites());
    $('#advisorResultCount').textContent=`显示 ${rows.length} / ${(data.advisors||[]).length} 位导师`;
    $('#advisorGrid').innerHTML=rows.map(a=>`<article class="advisor-card">
      <div class="advisor-card-head"><div class="advisor-name-line"><div class="avatar">${esc(a.name.slice(0,1))}</div><div><h4>${esc(a.name)} <span class="tag ${tierClass(a.tier)}">${esc(a.tier)}</span></h4><div class="affiliation">${esc(a.school)} · ${esc(a.hospital)}</div></div></div><button class="fav-btn ${fav.has(a.id)?'active':''}" data-fav="${esc(a.id)}" title="收藏">★</button></div>
      <div class="score-line"><span class="score-number">${a.match_score}</span><div class="score-bar"><i style="width:${a.match_score}%"></i></div><span class="muted">/100</span></div>
      <div class="tag-wrap">${(a.research_tags||[]).slice(0,5).map(t=>`<span class="mini-tag">${esc(t)}</span>`).join('')}</div>
      ${a.program_code||a.program_name?`<div class="program-line"><strong>${esc(a.program_code||'')}</strong> ${esc(a.program_name||'')} · ${esc(a.admission_track||join(a.degree_types))}</div>`:''}<p class="advisor-summary">${esc(a.research_summary)}</p><span class="coverage-chip">${esc(a.coverage_class||'待核实')}</span>
      <div class="card-footer"><span class="reliability">可靠性 ${esc(a.source_level)} · ${esc(a.admission_status)}</span><button class="detail-btn" data-detail="${esc(a.id)}">查看详情 →</button></div>
    </article>`).join('');
    $('#advisorEmpty').classList.toggle('hidden',rows.length>0);
    $$('[data-fav]', $('#advisorGrid')).forEach(b=>b.addEventListener('click',()=>toggleFavorite(b.dataset.fav)));
    $$('[data-detail]', $('#advisorGrid')).forEach(b=>b.addEventListener('click',()=>openAdvisor(b.dataset.detail)));
  }

  function openAdvisor(id){
    const a=(data.advisors||[]).find(x=>x.id===id); if(!a)return;
    $('#advisorDialogContent').innerHTML=`<div class="dialog-body">
      <div class="dialog-hero"><div class="dialog-avatar">${esc(a.name.slice(0,1))}</div><div><h3>${esc(a.name)} <span class="tag ${tierClass(a.tier)}">${esc(a.tier)} · ${a.match_score}分</span></h3><p>${esc(a.title)} · ${esc(a.school)}</p><p>${esc(a.hospital)} · ${esc(a.department)}</p></div></div>
      <div class="dialog-grid">
        <section class="dialog-section full"><h4>主要研究方向</h4><div class="tag-wrap">${(a.research_tags||[]).map(t=>`<span class="mini-tag">${esc(t)}</span>`).join('')}</div><p>${esc(a.research_summary)}</p></section>
        <section class="dialog-section"><h4>博士类型与招生状态</h4><p>${esc(join(a.degree_types))}</p><p><strong>${esc(a.program_code||'专业代码待核实')} ${esc(a.program_name||'')}</strong></p><p>${esc(a.program_direction||'超声方向口径待年度目录核验')}</p><p><span class="coverage-chip">${esc(a.coverage_class||a.admission_status)}</span></p><p class="muted">目录年份：${esc(a.catalog_year||'未公开')} · ${esc(a.quota||'导师个人名额未公开')}</p></section>
        <section class="dialog-section"><h4>公开联系方式</h4><p>${esc(a.email)}</p><p class="muted">来源：${esc(a.email_source)}</p></section>
        <section class="dialog-section"><h4>对你的主要优势</h4><ul>${(a.advantages||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>
        <section class="dialog-section"><h4>申请前需核实</h4><ul>${(a.risks||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>
        <section class="dialog-section full"><h4>项目与科研平台</h4><p>${esc(a.projects)}</p></section>
        <section class="dialog-section full"><h4>信息来源</h4><div class="dialog-links"><a href="${esc(a.homepage)}" target="_blank" rel="noopener">导师/团队主页</a><a href="${esc(a.secondary_source)}" target="_blank" rel="noopener">交叉验证来源</a><a href="${esc(a.admission_source)}" target="_blank" rel="noopener">招生信息入口</a></div><p class="muted" style="margin-top:9px">核验日期：${esc(a.verified_at)} · 可靠性等级：${esc(a.source_level)}</p></section>
      </div></div>`;
    $('#advisorDialog').showModal();
  }

  function filteredSchools(){
    const q=($('#schoolSearch').value||'').trim(), province=$('#schoolProvinceFilter').value, tier=$('#schoolTierFilter').value, status=$('#schoolStatusFilter').value;
    schoolFilters={q,province,tier,status};
    return [...(data.schools||[])].filter(s=>{
      const corpus=[s.name,...(s.units||[]),s.policy_summary,...(s.requirements||[])].join(' ');
      return (!q||textIncludes(corpus,q))&&(!province||s.province===province)&&(!tier||s.tier===tier)&&(!status||s.status===status);
    }).sort((a,b)=>b.match_score-a.match_score);
  }

  function renderSchools(){
    const rows=filteredSchools();
    $('#schoolGrid').innerHTML=rows.map(s=>`<article class="school-card"><div class="school-head"><div><h4>${esc(s.name)}</h4><div class="location">${esc(s.province)} · ${esc(s.city)} · 最近政策年份 ${esc(s.latest_policy_year)}</div></div><div><span class="tag ${tierClass(s.tier)}">${esc(s.tier)} ${s.match_score}</span> <span class="tag ${s.source_level==='A'?'success':'warning'}">来源 ${esc(s.source_level)}</span></div></div>
      <div class="school-meta">${(s.level||[]).map(t=>`<span class="mini-tag">${esc(t)}</span>`).join('')}</div>
      <div class="school-policy"><strong>${esc(s.latest_notice_title)}</strong><p>${esc(s.policy_summary)}</p></div>
      <dl><dt>培养单位</dt><dd>${esc(join(s.units))}</dd><dt>博士类型</dt><dd>${esc(join(s.degree_types))}</dd><dt>招生方式</dt><dd>${esc(join(s.admission_methods))}</dd><dt>名额信息</dt><dd>${esc(s.quota)}</dd><dt>需注意</dt><dd>${esc(join(s.requirements))}</dd></dl>
      <div class="school-actions"><a class="btn secondary" href="${esc(s.latest_notice_url)}" target="_blank" rel="noopener">打开官方入口</a></div></article>`).join('');
  }

  function renderRanking(){
    const fav=new Set(getFavorites());
    const rows=[...(data.advisors||[])].sort((a,b)=>b.match_score-a.match_score);
    $('#rankingList').innerHTML=rows.map((a,i)=>`<div class="ranking-row"><div class="rank-index ${i<3?'top':''}">${i+1}</div><div><h4>${esc(a.name)} ${fav.has(a.id)?'★':''}</h4><p>${esc(a.school)} · ${esc(a.hospital)}</p></div><div class="rank-reason">${esc(a.advantages?.[0]||a.research_summary)}</div><div class="rank-score">${a.match_score}</div><div class="rank-tier"><span class="tag ${tierClass(a.tier)}">${esc(a.tier)}</span></div></div>`).join('');
  }

  function renderTimeline(){
    $('#timelineList').innerHTML=(data.timeline||[]).map((t,i)=>`<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-date">${esc(t.date)}</div><div class="timeline-content"><h4>${i+1}. ${esc(t.title)}</h4><ul>${(t.tasks||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>`).join('');
  }

  function getTracker(){ return storage.get(KEYS.tracker,{}); }
  function updateTracker(id, field, value){ const obj=getTracker(); obj[id]={status:'未联系',date:'',note:'',...(obj[id]||{}),[field]:value}; storage.set(KEYS.tracker,obj); }

  function renderTracker(){
    const q=($('#trackerSearch').value||'').trim(), statusFilter=$('#trackerStatusFilter').value, tracker=getTracker(), fav=new Set(getFavorites());
    const rows=[...(data.advisors||[])].filter(a=>{
      const st=tracker[a.id]?.status||'未联系';
      return (!q||textIncludes(`${a.name} ${a.school} ${a.hospital}`,q))&&(!statusFilter||st===statusFilter);
    }).sort((a,b)=>b.match_score-a.match_score);
    $('#trackerTable').innerHTML=rows.map(a=>{
      const t={status:'未联系',date:'',note:'',...(tracker[a.id]||{})};
      return `<tr><td><button class="star-check ${fav.has(a.id)?'active':''}" data-track-fav="${esc(a.id)}">★</button></td><td><strong>${esc(a.name)}</strong><br><span class="muted">${esc(a.school)} · ${esc(a.hospital)}</span></td><td>${a.match_score}<br><span class="tag ${tierClass(a.tier)}">${esc(a.tier)}</span></td><td><select class="tracker-select" data-track-id="${esc(a.id)}" data-track-field="status">${['未联系','拟联系','已发送','已回复','需跟进','暂缓'].map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}</select></td><td><input class="tracker-input" type="date" value="${esc(t.date)}" data-track-id="${esc(a.id)}" data-track-field="date"></td><td><input class="tracker-input tracker-note" value="${esc(t.note)}" placeholder="例如：8月15日再次跟进" data-track-id="${esc(a.id)}" data-track-field="note"></td><td><a href="${esc(a.homepage)}" target="_blank" rel="noopener">主页</a></td></tr>`;
    }).join('');
    $$('[data-track-id]', $('#trackerTable')).forEach(el=>el.addEventListener('change',()=>updateTracker(el.dataset.trackId,el.dataset.trackField,el.value)));
    $$('[data-track-field="note"]', $('#trackerTable')).forEach(el=>el.addEventListener('input',()=>updateTracker(el.dataset.trackId,'note',el.value)));
    $$('[data-track-fav]', $('#trackerTable')).forEach(el=>el.addEventListener('click',()=>toggleFavorite(el.dataset.trackFav)));
  }

  function renderMaterials(){
    const saved=storage.get(KEYS.materials,{}), items=data.materials||[];
    const done=items.filter(x=>saved[x.id]===true).length, pct=items.length?Math.round(done/items.length*100):0;
    $('#materialProgress').innerHTML=`<div class="progress-head"><div><strong>完成 ${done} / ${items.length}</strong><div class="muted">建议在2026年9月前完成通用材料初稿</div></div><strong class="score-number">${pct}%</strong></div><div class="progress-track"><i style="width:${pct}%"></i></div>`;
    $('#materialList').innerHTML=items.map(x=>`<label class="check-item ${saved[x.id]?'done':''}"><input type="checkbox" data-material="${esc(x.id)}" ${saved[x.id]?'checked':''}><span>${esc(x.label)}</span></label>`).join('');
    $$('[data-material]').forEach(el=>el.addEventListener('change',()=>{const s=storage.get(KEYS.materials,{});s[el.dataset.material]=el.checked;storage.set(KEYS.materials,s);renderMaterials();}));
  }

  function renderSources(){
    const st=data.sourceStatus||{}, summary=st.summary||{}, total=data.sources?.length||0;
    const stats=[['监控入口',total,'官方招生页面'],['本次可访问',summary.ok||0,'状态为OK'],['访问受限',summary.limited||0,'需人工复核'],['抓取错误',summary.error||0,'链接或网络异常']];
    $('#sourceStats').innerHTML=stats.map(x=>`<div class="stat-card"><span class="stat-label">${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></div>`).join('');
    $('#sourceCheckTime').textContent=`最后检查：${formatDate(st.last_checked||'等待首次部署任务')}`;
    const statuses=new Map((st.sources||[]).map(x=>[x.source_id,x]));
    $('#sourceTable').innerHTML=(data.sources||[]).map(s=>{
      const x=statuses.get(s.id)||{status:'waiting',checked_at:'',candidate_count:'—',new_count:'—',message:'等待检查'};
      const label=x.status==='ok'?'正常':x.status==='limited'?'受限':x.status==='error'?'错误':'等待';
      return `<tr><td><strong>${esc(s.school)}</strong><br><span class="muted">${esc(x.message||'')}</span></td><td><span class="source-status ${sourceStatusClass(x.status)}">${label}</span></td><td>${esc(x.candidate_count??'—')}</td><td>${esc(x.new_count??'—')}</td><td>${esc(formatDate(x.checked_at))}</td><td><a href="${esc(s.url)}" target="_blank" rel="noopener">官网入口</a></td></tr>`;
    }).join('');
  }

  function csvEscape(v){ const s=String(v??''); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
  function downloadCSV(filename, rows){
    const csv='\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  }
  function exportAdvisors(){
    const rows=filteredAdvisors(); downloadCSV('超声博士导师筛选结果.csv',[
      ['导师','学校','医院','科室','博士类型','核验层级','目录年份','研究方向','邮箱','匹配分','档位','招生状态','主页','招生入口'],
      ...rows.map(a=>[a.name,a.school,a.hospital,a.department,join(a.degree_types),a.coverage_class,a.catalog_year,join(a.research_tags),a.email,a.match_score,a.tier,a.admission_status,a.homepage,a.admission_source])
    ]);
  }
  function exportTracker(){
    const t=getTracker(); downloadCSV('超声博士套磁进度.csv',[
      ['导师','学校','医院','匹配分','状态','联系日期','备注','主页'],
      ...(data.advisors||[]).map(a=>{const x={status:'未联系',date:'',note:'',...(t[a.id]||{})};return[a.name,a.school,a.hospital,a.match_score,x.status,x.date,x.note,a.homepage];})
    ]);
  }

  function attachInputs(){
    ['noticeSearch','noticeSchoolFilter','noticeTypeFilter','noticeYearFilter','noticeNewOnly'].forEach(id=>$('#'+id).addEventListener(id==='noticeSearch'?'input':'change',renderAdmissions));
    ['advisorSearch','advisorProvinceFilter','advisorCoverageFilter','advisorTierFilter','advisorDegreeFilter','advisorProgramFilter','advisorTagFilter','advisorScoreFilter','favoritesOnly'].forEach(id=>$('#'+id).addEventListener(['advisorSearch','advisorScoreFilter'].includes(id)?'input':'change',()=>{if(id==='advisorScoreFilter')$('#advisorScoreOutput').textContent=$('#advisorScoreFilter').value;renderAdvisors();}));
    ['schoolSearch','schoolProvinceFilter','schoolTierFilter','schoolStatusFilter'].forEach(id=>$('#'+id).addEventListener(id==='schoolSearch'?'input':'change',renderSchools));
    ['trackerSearch','trackerStatusFilter'].forEach(id=>$('#'+id).addEventListener(id==='trackerSearch'?'input':'change',renderTracker));
    $('#exportAdvisorBtn').addEventListener('click',exportAdvisors); $('#exportTrackerBtn').addEventListener('click',exportTracker);
    $('#resetMaterialsBtn').addEventListener('click',()=>{if(confirm('确定重置申请材料清单吗？')){storage.set(KEYS.materials,{});renderMaterials();}});
    $('#globalRefreshBtn').addEventListener('click',()=>loadRemoteData(true)); $('#admissionRefreshBtn').addEventListener('click',()=>loadRemoteData(true));
    $('#dialogCloseBtn').addEventListener('click',()=>$('#advisorDialog').close());
    $('#advisorDialog').addEventListener('click',e=>{if(e.target===$('#advisorDialog'))$('#advisorDialog').close();});
  }

  function renderAll(){
    setMode(); populateFilters(); renderDashboard(); renderAdmissions(); renderAdvisors(); renderSchools(); renderRanking(); renderTimeline(); renderTracker(); renderMaterials(); renderSources();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initNavigation(); attachInputs(); renderAll();
    if (['http:','https:'].includes(location.protocol)) await loadRemoteData(false);
  });
})();
