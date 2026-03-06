// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — OpenClawHelper
// Wires the friendly UI prototype to real GatewayClient + FileServer hooks.
//
// Data flow:
//   Step 1-4: pure local state (picked agents, souls, rules, privacy)
//   Step 5:   "启动" button triggers:
//               1. writeSoul()     for each agent with custom SOUL.md (FileServer)
//               2. config.patch()  agents.list + bindings + session  (Gateway WS)
//               3. show success / error inline — no terminal needed
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { getGatewayClient } from "./lib/gateway-client";
import { useFileServer, soulPath, agentFilePath } from "./hooks/useFileServer";

// ── Re-export everything from the prototype (styles, helpers, steps 1-4) ─────
// The prototype is the single source of truth for UI. We only replace the
// Root App component and Step5 here.

const FONT_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
  * { box-sizing: border-box; }
  @keyframes pop {
    0%   { transform: scale(0.9); opacity: 0; }
    65%  { transform: scale(1.03); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes float {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-7px); }
  }
  @keyframes confetti-fall {
    0%   { transform: translateY(-10px) rotate(0deg); opacity:1; }
    100% { transform: translateY(90px)  rotate(400deg); opacity:0; }
  }
  @keyframes slide-up {
    from { transform: translateY(16px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .pop       { animation: pop 0.22s ease forwards; }
  .float     { animation: float 3.2s ease-in-out infinite; }
  .slide-up  { animation: slide-up 0.2s ease forwards; }
  .spin      { animation: spin 1s linear infinite; display: inline-block; }
  textarea:focus, input:focus { outline: none; }
  textarea::placeholder, input::placeholder { color: #B8B8D0; }
  button { font-family: "Nunito", sans-serif; }
`;

const P = {
  bg:"#F4F6FF", white:"#FFFFFF", ink:"#1F1F30", soft:"#7878A0", border:"#E4E4F4",
  indigo:"#5B5FEF", teal:"#18B989", coral:"#FF6B4A", amber:"#F59E0B",
  cards:[
    ["#EDE8FF","#C5B8FF","#7C5FEA"],["#DCF5FF","#90D8FF","#2AA8D8"],
    ["#FFE8DA","#FFB899","#E8713A"],["#D8F7EC","#7FE8C4","#18B989"],
    ["#FFF8D0","#FFE066","#C8950A"],["#FFE0F0","#FFAACC","#D8408A"],
  ],
};

const AGENT_TEMPLATES = [
  { emoji:"🧠", label:"聪明管家",  cardColor:0, agentId:"orchestrator",
    desc:"负责理解你的问题，分配给合适的小助手",
    soulStarter:`# 聪明管家\n\n## 角色\n你是一位高效的任务协调员。你会先理解用户想要做什么，然后把任务分配给最合适的专业助手。\n\n## 行为准则\n- 先问清楚用户的目标，再决定找哪位助手\n- 用简洁友好的语气和用户沟通\n- 如果你不确定找哪位助手，就直接自己回答\n\n## 禁忌\n- 不要让用户感到困惑或等待太久` },
  { emoji:"💻", label:"代码专家",  cardColor:1, agentId:"coder",
    desc:"帮你检查和修改代码，找出 bug",
    soulStarter:`# 代码专家\n\n## 角色\n你是一位经验丰富的程序员助手。你擅长找到代码里的问题、解释复杂的技术概念、写出简洁易懂的代码。\n\n## 风格\n- 先说结论，再解释原因\n- 给出代码示例时附上注释\n- 像老师一样耐心，但不啰嗦\n\n## 禁忌\n- 不要写出难以维护的代码\n- 不要假设用户懂很多术语` },
  { emoji:"✍️", label:"写作助手",  cardColor:2, agentId:"writer",
    desc:"帮你写文章、邮件、公众号",
    soulStarter:`# 写作助手\n\n## 角色\n你是一位资深的公众号写作专家，擅长用犀利、真实的视角剖析技术话题。\n\n## 风格\n- 开头必须用一个引人入胜的场景或反直觉的观点\n- 段落短小精悍，移动端阅读友好\n- 善用类比，让小学生也能听懂复杂概念\n- 结尾必须有行动号召（CTA）\n\n## 禁忌\n- 不使用"众所周知""不言而喻"等空洞词汇\n- 不堆砌术语，每个专业名词第一次出现时必须解释` },
  { emoji:"🔍", label:"资料搜集",  cardColor:3, agentId:"researcher",
    desc:"上网找信息，整理成清晰的摘要",
    soulStarter:`# 资料搜集助手\n\n## 角色\n你是一位细心的研究员，擅长快速找到可靠的信息并整理成清晰的摘要。\n\n## 行为准则\n- 给出信息来源\n- 区分事实和观点\n- 用要点式呈现，方便快速浏览` },
  { emoji:"🎨", label:"创意顾问",  cardColor:4, agentId:"creative",
    desc:"头脑风暴、想创意、出点子",
    soulStarter:`# 创意顾问\n\n## 角色\n你是一位充满想象力的创意伙伴，专门帮用户突破思维定式，找到新鲜的想法。\n\n## 风格\n- 多提选项，不只给一个答案\n- 鼓励大胆想法，再一起打磨\n- 用提问引导用户发现自己的想法` },
  { emoji:"📊", label:"数据助手",  cardColor:5, agentId:"analyst",
    desc:"处理表格、数字，帮你看懂数据",
    soulStarter:`# 数据助手\n\n## 角色\n你是一位专业的数据分析师，擅长把复杂的数字和表格变成人人都能看懂的结论。\n\n## 风格\n- 先说最重要的结论\n- 用简单的数字说明问题\n- 避免让人看不懂的统计学术语` },
];

const starterAgentsMd = (label) => `# ${label} 入职手册（AGENTS.md）

## 角色定位
- 你是「${label}」助手，专注当前职责范围。
- 先理解需求，再输出可执行结果。

## 工作原则
- 先给结论，再给关键依据。
- 复杂任务拆步骤，语言简洁清楚。
- 不确定时明确说明，并给下一步建议。

## 禁止事项
- 未确认前不执行高风险或破坏性动作。
- 不编造事实，不假装已完成未完成的操作。
- 涉及外发（消息/邮件/发布）前先确认。
`;

const starterUserMd = () => `# 用户资料（USER.md）

## 用户偏好
- 称呼：
- 语言：中文
- 输出偏好：先结论后细节

## 关注重点
- 

## 协作约定
- 若任务超过 3 分钟，主动汇报：进展 / 卡点 / 下一步。
- 本文件由用户长期维护，系统不会自动覆盖已有内容。
`;

const CHANNEL_OPTIONS = [
  {id:"slack",    emoji:"⚡", label:"Slack"},
  {id:"discord",  emoji:"🎮", label:"Discord"},
  {id:"telegram", emoji:"✈️", label:"Telegram"},
  {id:"whatsapp", emoji:"💬", label:"WhatsApp"},
  {id:"any",      emoji:"🌐", label:"所有渠道"},
];

const PRIVACY_OPTIONS = [
  {id:"per-channel-peer", emoji:"🏠", label:"每个人独立",    color:"#D8F7EC", border:"#7FE8C4", recommended:true,
   desc:"每个人和助手说的话完全分开，互不干扰。大多数情况推荐用这个！"},
  {id:"per-peer",         emoji:"👤", label:"按联系人分开",  color:"#DCF5FF", border:"#90D8FF",
   desc:"同一个人在不同地方发的消息会共享记忆。适合一对一使用。"},
  {id:"main",             emoji:"🌍", label:"所有人共享",    color:"#FFE8DA", border:"#FFB899", warn:true,
   desc:"大家的对话都在一起，助手能看到所有人说的话。只适合自己一个人用！"},
];

const EASY_FIELDS=[
  {key:"personality",icon:"😊",label:"性格",ph:"这个助手的性格是什么？活泼？严谨？幽默？"},
  {key:"skills",     icon:"🎯",label:"专长",ph:"它最擅长什么？有什么特别的技能？"},
  {key:"tone",       icon:"💬",label:"说话方式",ph:"它怎么和用户说话？正式还是轻松？"},
  {key:"forbidden",  icon:"🚫",label:"不能做",ph:"有什么它绝对不该做的事情？"},
];

const DOC_EASY_FIELDS = {
  agents: [
    { key:"role", icon:"🧭", label:"角色定位", ph:"它在团队里主要负责什么？" },
    { key:"rules", icon:"📏", label:"工作原则", ph:"它做事必须遵守哪些原则？" },
    { key:"style", icon:"🗣️", label:"输出风格", ph:"它输出时要保持什么风格？" },
    { key:"ban", icon:"⛔", label:"禁止事项", ph:"有哪些绝对不能做的事？" },
  ],
  user: [
    { key:"name", icon:"🙋", label:"称呼与关系", ph:"应该怎么称呼用户？" },
    { key:"prefs", icon:"🎯", label:"用户偏好", ph:"用户在沟通与输出上的偏好？" },
    { key:"goals", icon:"🚀", label:"长期目标", ph:"用户最近最关注的目标是什么？" },
    { key:"notes", icon:"📝", label:"协作备注", ph:"还有哪些长期协作约定？" },
  ],
};

const STEPS=[
  {n:1,emoji:"🤖",label:"选助手"},{n:2,emoji:"📝",label:"写入职材料"},
  {n:3,emoji:"🔗",label:"连渠道"},{n:4,emoji:"🔒",label:"隐私"},{n:5,emoji:"🚀",label:"完成"},
];

const cardC = i => P.cards[i % P.cards.length];

// ── Shared UI atoms ────────────────────────────────────────────────────────────
function Pill({bg,border,children,style}){
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:bg,
    border:`2px solid ${border}`,borderRadius:20,padding:"3px 12px",
    fontSize:13,fontWeight:700,color:P.ink,...style}}>{children}</span>;
}

function Btn({children,onClick,color=P.indigo,ghost,small,disabled,style}){
  const [hov,setHov]=useState(false);
  if(ghost) return(
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:hov?"#F0F0F8":P.white,color:P.soft,border:"2px solid #E0E0F0",
        borderRadius:14,padding:small?"6px 14px":"11px 24px",fontSize:small?12:14,
        fontWeight:700,cursor:"pointer",transition:"all 0.15s",...style}}>
      {children}
    </button>
  );
  return(
    <button onClick={disabled?undefined:onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:disabled?"#D0D0E0":color,color:"#fff",border:"none",
        borderRadius:16,padding:small?"8px 18px":"13px 28px",
        fontSize:small?13:15,fontWeight:800,cursor:disabled?"default":"pointer",
        boxShadow:hov&&!disabled?`0 6px 20px ${color}66`:`0 3px 10px ${color}33`,
        transform:hov&&!disabled?"translateY(-2px)":"none",
        transition:"all 0.18s ease",opacity:disabled?0.7:1,...style}}>
      {children}
    </button>
  );
}

function StepBar({current}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0}}>
      {STEPS.map((s,i)=>{
        const done=current>s.n,active=current===s.n;
        return(
          <div key={s.n} style={{display:"flex",alignItems:"center"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <div style={{width:48,height:48,borderRadius:15,
                background:active?P.indigo:done?P.teal:P.white,
                border:`3px solid ${active?P.indigo:done?P.teal:"#DDDDF0"}`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
                boxShadow:active?`0 4px 14px ${P.indigo}44`:"none",
                transform:active?"scale(1.12)":"scale(1)",transition:"all 0.2s"}}>
                {done?"✓":s.emoji}
              </div>
              <span style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",
                color:active?P.indigo:done?P.teal:P.soft}}>{s.label}</span>
            </div>
            {i<STEPS.length-1&&(
              <div style={{width:36,height:3,margin:"0 3px",marginBottom:18,
                background:done?P.teal:"#E8E8F5",borderRadius:2,transition:"background 0.3s"}}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Pick agents ────────────────────────────────────────────────────────
function Step1({picked,onToggle,onNext}){
  return(
    <div className="slide-up">
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:44,marginBottom:8}}>🤖</div>
        <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:P.ink,margin:"0 0 6px"}}>
          你想要哪些 AI 小助手？
        </h2>
        <p style={{fontSize:14,color:P.soft,margin:0}}>点击卡片就能加入团队，想要几个都行！</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        {AGENT_TEMPLATES.map(t=>{
          const on=picked.includes(t.label);
          const [bg,border]=cardC(t.cardColor);
          return(
            <div key={t.label} onClick={()=>onToggle(t.label)}
              style={{background:on?bg:P.white,border:`3px solid ${on?border:"#EAEAF5"}`,
                borderRadius:20,padding:"16px 12px",cursor:"pointer",textAlign:"center",
                transform:on?"scale(1.04)":"scale(1)",
                boxShadow:on?`0 6px 18px ${border}66`:"0 2px 8px #0000000A",
                transition:"all 0.18s ease",position:"relative"}}
              onMouseEnter={e=>{if(!on)e.currentTarget.style.transform="scale(1.02)";}}
              onMouseLeave={e=>{if(!on)e.currentTarget.style.transform="scale(1)";}}
            >
              {on&&<div style={{position:"absolute",top:-9,right:-9,width:26,height:26,borderRadius:"50%",
                background:P.teal,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:13,fontWeight:900,border:"3px solid white"}}>✓</div>}
              <div style={{fontSize:30,marginBottom:6}}>{t.emoji}</div>
              <div style={{fontFamily:"Fredoka One,cursive",fontSize:15,color:P.ink,marginBottom:4}}>{t.label}</div>
              <div style={{fontSize:11,color:P.soft,lineHeight:1.4}}>{t.desc}</div>
            </div>
          );
        })}
      </div>
      {picked.length>0&&(
        <div style={{background:"#FFFBE8",border:"2px solid #FFE066",borderRadius:14,
          padding:"12px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span>⭐</span><span style={{fontWeight:700,color:P.ink,fontSize:13}}>已选：</span>
          {picked.map(l=>{const t=AGENT_TEMPLATES.find(x=>x.label===l);const[bg,border]=cardC(t.cardColor);
            return <Pill key={l} bg={bg} border={border}>{t.emoji} {l}</Pill>;})}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <Btn onClick={onNext} disabled={picked.length===0}>下一步：写助手文档 →</Btn>
      </div>
    </div>
  );
}

// ── Step 2: Soul editor ────────────────────────────────────────────────────────
function SoulEditor({agent,soul,onChange}){
  const t=AGENT_TEMPLATES.find(x=>x.label===agent.label);
  const [bg,border,dot]=cardC(t.cardColor);
  const [tab,setTab]=useState("easy");
  const [easy,setEasy]=useState({personality:"",skills:"",tone:"",forbidden:""});

  const buildFromEasy=e=>[
    `# ${agent.label}`,"",`## 性格`,e.personality||"（未填写）","",
    `## 专长`,e.skills||"（未填写）`","",`## 说话方式`,e.tone||"（未填写）","",
    `## 禁忌`,e.forbidden||"（未填写）",
  ].join("\n");

  const handleEasy=(key,val)=>{const next={...easy,[key]:val};setEasy(next);onChange(buildFromEasy(next));};

  const wordCount=soul?.trim().length||0;
  const fillLevel=Math.min(100,Math.round(wordCount/3));
  const fillColor=fillLevel<20?"#FFB899":fillLevel<60?"#FFE066":dot;

  const getPreviewLine=()=>{
    if(!soul)return`你好！我是${t.label}，很高兴认识你！`;
    const m=soul.match(/说话方式[\s\S]*?\n([^#\n].+)/)||soul.match(/性格[\s\S]*?\n([^#\n].+)/);
    return m?.[1]?.trim()?`（${m[1].trim()}风格）`:`你好！我是${t.label}，请告诉我你需要什么帮助！`;
  };

  return(
    <div style={{background:P.white,border:`3px solid ${border}`,borderRadius:22,overflow:"hidden",boxShadow:`0 6px 24px ${border}55`}}>
      <div style={{background:bg,padding:"16px 20px",borderBottom:`2px solid ${border}66`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:48,height:48,borderRadius:16,background:P.white,display:"flex",
            alignItems:"center",justifyContent:"center",fontSize:26,boxShadow:`0 4px 12px ${border}88`}}>
            {t.emoji}
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"Fredoka One,cursive",fontSize:18,color:P.ink}}>{t.label}</div>
            <div style={{fontSize:12,color:P.soft}}>告诉它它是谁</div>
          </div>
          <div style={{textAlign:"center",minWidth:60}}>
            <div style={{fontSize:11,color:P.soft,fontWeight:700,marginBottom:4}}>
              {fillLevel<20?"还没写":"写得不错"}{fillLevel>=80?" 🌟":""}
            </div>
            <div style={{width:60,height:8,background:"#0000001A",borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${fillLevel}%`,background:fillColor,borderRadius:4,transition:"width 0.4s ease"}}/>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:0,background:"#0000001A",borderRadius:12,padding:3,marginTop:14,width:"fit-content"}}>
          {[["easy","✨ 简单模式"],["advanced","✏️ 自由编辑"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{background:tab===id?"#fff":"none",border:"none",borderRadius:10,
                padding:"7px 16px",fontSize:13,fontWeight:700,cursor:"pointer",
                color:tab===id?P.ink:P.soft,transition:"all 0.15s",
                boxShadow:tab===id?"0 2px 8px #00000015":"none"}}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"20px 22px"}}>
        {tab==="easy"&&(
          <div className="slide-up">
            <div style={{background:"#F0F4FF",borderRadius:12,padding:"10px 14px",fontSize:13,
              color:"#4050A0",fontWeight:600,marginBottom:16,display:"flex",alignItems:"flex-start",gap:8,lineHeight:1.5}}>
              <span>💡</span><span>像介绍朋友一样填写！越详细，助手越懂你。不会写？直接点"用模板"！</span>
            </div>
            {EASY_FIELDS.map(f=>(
              <div key={f.key} style={{marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:P.soft,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                  <span>{f.icon}</span>{f.label}
                </div>
                <input value={easy[f.key]} onChange={e=>handleEasy(f.key,e.target.value)} placeholder={f.ph}
                  style={{width:"100%",padding:"11px 14px",borderRadius:12,border:"2px solid #E8E8F5",
                    fontSize:13,fontFamily:"Nunito,sans-serif",transition:"border 0.15s",color:P.ink,background:"#FAFAFE"}}
                  onFocus={e=>e.target.style.borderColor=dot}
                  onBlur={e=>e.target.style.borderColor="#E8E8F5"}/>
              </div>
            ))}
            <div style={{marginTop:18,padding:"14px 16px",background:"#F8F8FF",border:"2px dashed #D0D0EE",
              borderRadius:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:13,color:P.ink,marginBottom:2}}>📋 用专业模板</div>
                <div style={{fontSize:12,color:P.soft}}>一键填入精心写好的角色设定，你可以再修改</div>
              </div>
              <Btn small color={dot} onClick={()=>{onChange(t.soulStarter);setEasy({personality:"",skills:"",tone:"",forbidden:""});setTab("advanced");}}>用模板 →</Btn>
            </div>
          </div>
        )}
        {tab==="advanced"&&(
          <div className="slide-up">
            <div style={{background:"#FAFAFE",borderRadius:12,padding:"10px 14px",fontSize:13,
              color:P.soft,marginBottom:12,display:"flex",alignItems:"flex-start",gap:8,lineHeight:1.5}}>
              <span>📝</span><span>直接编辑助手的「性格说明书」，用任何格式写都行，越详细越好。</span>
            </div>
            <textarea value={soul} onChange={e=>onChange(e.target.value)} rows={11}
              placeholder={t.soulStarter}
              style={{width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid #E8E8F5",
                fontSize:13,fontFamily:"'Courier New',Courier,monospace",lineHeight:1.7,
                resize:"vertical",background:"#FCFCFF",color:P.ink,transition:"border 0.15s"}}
              onFocus={e=>e.target.style.borderColor=dot}
              onBlur={e=>e.target.style.borderColor="#E8E8F5"}/>
            <div style={{marginTop:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,fontWeight:700,color:fillLevel<20?P.soft:fillLevel<60?P.amber:P.teal}}>
                {fillLevel<20?"💬 写几句就够用了":fillLevel<60?"✏️ 写得挺好，继续加！":"🌟 很详细，助手会非常聪明！"}
              </div>
              <div style={{fontSize:11,color:P.soft}}>{wordCount} 字</div>
            </div>
          </div>
        )}
        {soul&&soul.trim()&&(
          <div style={{marginTop:16,padding:"14px 16px",background:`${bg}BB`,border:`2px solid ${border}`,borderRadius:16}}>
            <div style={{fontSize:11,fontWeight:800,color:dot,marginBottom:8}}>👀 助手会这样打招呼：</div>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <div style={{width:32,height:32,borderRadius:10,background:P.white,display:"flex",
                alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,border:`2px solid ${border}`}}>
                {t.emoji}
              </div>
              <div style={{background:P.white,border:`2px solid ${border}`,borderRadius:"0 14px 14px 14px",
                padding:"10px 14px",fontSize:13,color:P.ink,lineHeight:1.5,fontStyle:"italic",maxWidth:"90%"}}>
                {getPreviewLine()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DocMaterialEditor({agent,docType,value,onChange}){
  const t=AGENT_TEMPLATES.find(x=>x.label===agent.label);
  const [bg,border,dot]=cardC(t.cardColor);
  const [tab,setTab]=useState("easy");
  const [easy,setEasy]=useState({role:"",rules:"",style:"",ban:"",name:"",prefs:"",goals:"",notes:""});

  const isAgents = docType === "agents";
  const fields = isAgents ? DOC_EASY_FIELDS.agents : DOC_EASY_FIELDS.user;
  const template = isAgents ? starterAgentsMd(agent.label) : starterUserMd();

  const buildFromEasy = (e) => {
    if (isAgents) {
      return `# ${agent.label} 入职手册（AGENTS.md）\n\n## 角色定位\n${e.role||"（未填写）"}\n\n## 工作原则\n${e.rules||"（未填写）"}\n\n## 输出风格\n${e.style||"（未填写）"}\n\n## 禁止事项\n${e.ban||"（未填写）"}`;
    }
    return `# 用户资料（USER.md）\n\n## 称呼与关系\n${e.name||"（未填写）"}\n\n## 用户偏好\n${e.prefs||"（未填写）"}\n\n## 长期目标\n${e.goals||"（未填写）"}\n\n## 协作备注\n${e.notes||"（未填写）"}`;
  };

  const handleEasy = (key,val) => {
    const next = {...easy,[key]:val};
    setEasy(next);
    onChange(buildFromEasy(next));
  };

  const wordCount=value?.trim().length||0;
  const fillLevel=Math.min(100,Math.round(wordCount/4));
  const fillColor=fillLevel<20?"#FFB899":fillLevel<60?"#FFE066":dot;

  return(
    <div style={{background:P.white,border:`3px solid ${border}`,borderRadius:22,overflow:"hidden",boxShadow:`0 6px 24px ${border}55`}}>
      <div style={{background:bg,padding:"16px 20px",borderBottom:`2px solid ${border}66`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:48,height:48,borderRadius:16,background:P.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,boxShadow:`0 4px 12px ${border}88`}}>{t.emoji}</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"Fredoka One,cursive",fontSize:18,color:P.ink}}>{isAgents?"AGENTS.md":"USER.md"}</div>
            <div style={{fontSize:12,color:P.soft}}>{isAgents?"定义助手工作准则":"定义用户长期偏好与协作方式"}</div>
          </div>
          <div style={{textAlign:"center",minWidth:60}}>
            <div style={{fontSize:11,color:P.soft,fontWeight:700,marginBottom:4}}>{fillLevel<20?"还没写":"写得不错"}{fillLevel>=80?" 🌟":""}</div>
            <div style={{width:60,height:8,background:"#0000001A",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${fillLevel}%`,background:fillColor,borderRadius:4,transition:"width 0.4s ease"}}/></div>
          </div>
        </div>
        <div style={{display:"flex",gap:0,background:"#0000001A",borderRadius:12,padding:3,marginTop:14,width:"fit-content"}}>
          {[ ["easy","✨ 简单模式"], ["advanced","✏️ 自由编辑"] ].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{background:tab===id?"#fff":"none",border:"none",borderRadius:10,padding:"7px 16px",fontSize:13,fontWeight:700,cursor:"pointer",color:tab===id?P.ink:P.soft}}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"20px 22px"}}>
        {tab==="easy" && (
          <div className="slide-up">
            <div style={{background:"#F0F4FF",borderRadius:12,padding:"10px 14px",fontSize:13,color:"#4050A0",fontWeight:600,marginBottom:16,display:"flex",alignItems:"flex-start",gap:8,lineHeight:1.5}}>
              <span>💡</span><span>{isAgents?"把它当成助手的工作手册来写，越清晰越稳定。":"把它当成用户档案来写，越具体越懂你。"}</span>
            </div>
            {fields.map(f=>(
              <div key={f.key} style={{marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:P.soft,marginBottom:6,display:"flex",alignItems:"center",gap:6}}><span>{f.icon}</span>{f.label}</div>
                <input value={easy[f.key]||""} onChange={e=>handleEasy(f.key,e.target.value)} placeholder={f.ph}
                  style={{width:"100%",padding:"11px 14px",borderRadius:12,border:"2px solid #E8E8F5",fontSize:13,fontFamily:"Nunito,sans-serif",color:P.ink,background:"#FAFAFE"}}
                />
              </div>
            ))}
            <div style={{marginTop:18,padding:"14px 16px",background:"#F8F8FF",border:"2px dashed #D0D0EE",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:13,color:P.ink,marginBottom:2}}>📋 使用中文模板</div>
                <div style={{fontSize:12,color:P.soft}}>一键填入中文模板，后续你可继续修改</div>
              </div>
              <Btn small color={dot} onClick={()=>{onChange(template);setTab("advanced");}}>用模板 →</Btn>
            </div>
          </div>
        )}
        {tab==="advanced" && (
          <div className="slide-up">
            <div style={{background:"#FAFAFE",borderRadius:12,padding:"10px 14px",fontSize:13,color:P.soft,marginBottom:12,display:"flex",alignItems:"flex-start",gap:8,lineHeight:1.5}}>
              <span>📝</span><span>{isAgents?"直接编辑助手的入职手册（AGENTS.md）。":"直接编辑用户资料（USER.md）。"}</span>
            </div>
            <textarea value={value} onChange={e=>onChange(e.target.value)} rows={14} placeholder={template}
              style={{width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid #E8E8F5",fontSize:13,fontFamily:"'Courier New',Courier,monospace",lineHeight:1.7,resize:"vertical",background:"#FCFCFF",color:P.ink}}
            />
            <div style={{marginTop:8,textAlign:"right",fontSize:11,color:P.soft}}>{wordCount} 字</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step2({picked,souls,agentsDocs,userDocs,onSoulChange,onAgentsDocChange,onUserDocChange,onNext,onBack}){
  const agents=AGENT_TEMPLATES.filter(t=>picked.includes(t.label));
  const [cur,setCur]=useState(0);
  const [docTab,setDocTab]=useState("soul");
  const agent=agents[cur];
  const t=AGENT_TEMPLATES.find(x=>x.label===agent.label);
  const [bg,border,dot]=cardC(t.cardColor);

  return(
    <div className="slide-up">
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:44,marginBottom:8}}>📝</div>
        <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:P.ink,margin:"0 0 6px"}}>给每个助手完善入职材料</h2>
        <p style={{fontSize:14,color:P.soft,margin:0}}>SOUL.md / AGENTS.md / USER.md 都可以在这里编辑</p>
      </div>
      {agents.length>1&&(
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {agents.map((a,i)=>{
            const[abg,aborder]=cardC(a.cardColor);
            const filled=!!souls[a.label]?.trim()||!!agentsDocs[a.label]?.trim()||!!userDocs[a.label]?.trim();
            return(
              <div key={a.label} onClick={()=>setCur(i)}
                style={{display:"flex",alignItems:"center",gap:7,padding:"7px 14px",
                  borderRadius:14,cursor:"pointer",border:`2px solid ${cur===i?aborder:"#E8E8F5"}`,
                  background:cur===i?abg:P.white,transition:"all 0.15s"}}>
                <span style={{fontSize:18}}>{a.emoji}</span>
                <span style={{fontFamily:"Fredoka One,cursive",fontSize:13,color:P.ink}}>{a.label}</span>
                {filled&&<span style={{fontSize:10,color:P.teal,fontWeight:800}}>✓</span>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:"flex",gap:0,background:"#F2F3FF",borderRadius:12,padding:3,marginBottom:14,width:"fit-content"}}>
        {[ ["soul","✨ SOUL.md"], ["agents","📘 AGENTS.md"], ["user","👤 USER.md"] ].map(([id,lbl])=>{
          const filled = id==="soul"
            ? !!(souls[agent.label]||"").trim()
            : id==="agents"
              ? !!(agentsDocs[agent.label]||"").trim()
              : !!(userDocs[agent.label]||"").trim();
          return(
            <button key={id} onClick={()=>setDocTab(id)}
              style={{background:docTab===id?"#fff":"none",border:"none",borderRadius:10,padding:"7px 12px",fontSize:13,fontWeight:700,cursor:"pointer",color:docTab===id?P.ink:P.soft,display:"inline-flex",alignItems:"center",gap:8}}>
              <span>{lbl}</span>
              <span title={filled?"已填写":"未填写"} style={{width:9,height:9,borderRadius:"50%",display:"inline-block",background:filled?P.teal:"#D8D8E8",boxShadow:filled?`0 0 0 2px ${P.teal}22`:"none"}}/>
            </button>
          );
        })}
      </div>

      {docTab==="soul" && <SoulEditor agent={agent} soul={souls[agent.label]||""} onChange={v=>onSoulChange(agent.label,v)}/>}

      {docTab!=="soul" && (
        <DocMaterialEditor
          agent={agent}
          docType={docTab}
          value={docTab==="agents"?(agentsDocs[agent.label]||""):(userDocs[agent.label]||"")}
          onChange={(v)=>docTab==="agents"?onAgentsDocChange(agent.label,v):onUserDocChange(agent.label,v)}
        />
      )}

      <div style={{display:"flex",justifyContent:"space-between",marginTop:24}}>
        <Btn ghost onClick={onBack}>← 上一步</Btn>
        <Btn onClick={onNext} color={P.indigo}>下一步：连接渠道 →</Btn>
      </div>
    </div>
  );
}

// ── Step 3: Bindings ───────────────────────────────────────────────────────────
function Step3({picked,rules,onAddRule,onRemoveRule,onNext,onBack}){
  const agents=AGENT_TEMPLATES.filter(t=>picked.includes(t.label));
  const [dragging,setDragging]=useState(null);
  const [hovering,setHovering]=useState(null);
  return(
    <div className="slide-up">
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:44,marginBottom:8}}>🔗</div>
        <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:P.ink,margin:"0 0 6px"}}>把助手拖到对应的渠道上</h2>
        <p style={{fontSize:14,color:P.soft,margin:0}}>哪个渠道发来的消息，就由哪个助手来回答</p>
      </div>
      <div style={{display:"flex",gap:20,marginBottom:20}}>
        <div style={{flex:"0 0 180px"}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:1,color:P.soft,marginBottom:10,textTransform:"uppercase"}}>📦 拖动小助手</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {agents.map(a=>{
              const[bg,border]=cardC(a.cardColor);
              return(
                <div key={a.label} draggable onDragStart={()=>setDragging(a.label)} onDragEnd={()=>{setDragging(null);setHovering(null);}}
                  style={{background:dragging===a.label?bg:P.white,border:`3px solid ${dragging===a.label?border:"#E8E8F5"}`,
                    borderRadius:16,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
                    cursor:"grab",transform:dragging===a.label?"scale(1.05) rotate(-2deg)":"scale(1)",
                    transition:"all 0.15s",userSelect:"none",
                    boxShadow:dragging===a.label?`0 8px 24px ${border}77`:"0 2px 6px #0000000A"}}>
                  <span style={{fontSize:22}}>{a.emoji}</span>
                  <span style={{fontFamily:"Fredoka One,cursive",fontSize:13,color:P.ink}}>{a.label}</span>
                  <span style={{marginLeft:"auto",fontSize:14,color:P.soft}}>⠿</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:1,color:P.soft,marginBottom:10,textTransform:"uppercase"}}>📡 放到渠道上</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {CHANNEL_OPTIONS.map(ch=>{
              const assigned=rules.filter(r=>r.channelId===ch.id);
              const isHov=hovering===ch.id&&dragging;
              return(
                <div key={ch.id}
                  onDragOver={e=>{e.preventDefault();setHovering(ch.id);}}
                  onDragLeave={()=>setHovering(null)}
                  onDrop={()=>{
                    if(dragging){
                      const a=agents.find(x=>x.label===dragging);
                      if(a&&!rules.some(r=>r.agentLabel===dragging&&r.channelId===ch.id))
                        onAddRule({agentLabel:dragging,channelId:ch.id,agent:a});
                    }
                    setDragging(null);setHovering(null);
                  }}
                  style={{minHeight:56,background:isHov?"#EEF0FF":"#FAFAFE",
                    border:`3px dashed ${isHov?P.indigo:"#D8D8F0"}`,borderRadius:16,
                    padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",
                    transition:"all 0.15s",transform:isHov?"scale(1.01)":"scale(1)"}}>
                  <span style={{fontSize:20}}>{ch.emoji}</span>
                  <span style={{fontFamily:"Fredoka One,cursive",fontSize:14,color:P.ink,minWidth:68}}>{ch.label}</span>
                  {assigned.length===0&&<span style={{fontSize:12,color:"#C8C8E0",fontStyle:"italic"}}>拖一个助手到这里…</span>}
                  {assigned.map(r=>{
                    const[bg,border]=cardC(r.agent.cardColor);
                    return(
                      <Pill key={r.agentLabel} bg={bg} border={border}>
                        {r.agent.emoji} {r.agentLabel}
                        <button onClick={()=>onRemoveRule(r.agentLabel,ch.id)}
                          style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:P.soft,padding:"0 0 0 4px",lineHeight:1}}>×</button>
                      </Pill>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{background:P.cards[1][0],border:`2px solid ${P.cards[1][1]}`,borderRadius:14,
        padding:"10px 16px",fontSize:13,color:"#1A5A8A",fontWeight:600,marginBottom:20,
        display:"flex",alignItems:"center",gap:8}}>
        💡 <span>可以把同一个助手拖到多个渠道。"所有渠道"是没被特别指定时的默认助手。</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Btn ghost onClick={onBack}>← 上一步</Btn>
        <Btn onClick={onNext} color={P.indigo}>下一步：隐私设置 →</Btn>
      </div>
    </div>
  );
}

// ── Step 4: Privacy ────────────────────────────────────────────────────────────
function Step4({privacy,setPrivacy,onNext,onBack}){
  return(
    <div className="slide-up">
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:44,marginBottom:8}}>🔒</div>
        <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:P.ink,margin:"0 0 6px"}}>谁能看到对话记录？</h2>
        <p style={{fontSize:14,color:P.soft,margin:0}}>选一个隐私模式</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:28}}>
        {PRIVACY_OPTIONS.map(opt=>{
          const on=privacy===opt.id;
          return(
            <div key={opt.id} onClick={()=>setPrivacy(opt.id)}
              style={{background:on?opt.color:P.white,border:`3px solid ${on?opt.border:"#EAEAF5"}`,
                borderRadius:20,padding:"18px 22px",cursor:"pointer",
                display:"flex",alignItems:"flex-start",gap:16,
                transform:on?"scale(1.01)":"scale(1)",
                boxShadow:on?`0 6px 18px ${opt.border}55`:"0 2px 8px #0000000A",
                transition:"all 0.18s ease"}}>
              <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginTop:3,
                border:`3px solid ${on?opt.border:"#C8C8E0"}`,background:on?opt.border:P.white,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                {on&&<div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
                  <span style={{fontSize:24}}>{opt.emoji}</span>
                  <span style={{fontFamily:"Fredoka One,cursive",fontSize:17,color:P.ink}}>{opt.label}</span>
                  {opt.recommended&&<Pill bg="#D8F7EC" border="#7FE8C4" style={{fontSize:11}}>👍 推荐</Pill>}
                </div>
                <p style={{fontSize:13,color:P.soft,margin:0,lineHeight:1.6}}>{opt.desc}</p>
                {opt.warn&&on&&(
                  <div style={{marginTop:10,background:"#FFF0EC",border:"2px solid #FFBBA8",
                    borderRadius:10,padding:"8px 12px",fontSize:13,color:"#B03020",fontWeight:700,
                    display:"flex",alignItems:"center",gap:6}}>
                    ⚠️ 如果有多个人使用，他们可以看到彼此的对话内容，请注意！
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Btn ghost onClick={onBack}>← 上一步</Btn>
        <Btn onClick={onNext} color={P.indigo}>完成并启动！🚀</Btn>
      </div>
    </div>
  );
}

// ── Step 5: Launch — REAL Gateway + FileServer ─────────────────────────────────
function Step5({picked,souls,agentsDocs,userDocs,rules,privacy,onEdit,wsConnected,wsState,editMode=false,baseAgentList=[],baseBindings=[]}){
  const agents=AGENT_TEMPLATES.filter(t=>picked.includes(t.label));
  const privOpt=PRIVACY_OPTIONS.find(p=>p.id===privacy);
  const { writeSoul, readFile, writeFile, status: fsStatus } = useFileServer();

  // "idle" | "running" | "success" | "error"
  const [launchStatus, setLaunchStatus] = useState("idle");
  const [launchLog,    setLaunchLog]    = useState([]);  // [{ok, msg}]
  const [errorMsg,     setErrorMsg]     = useState("");
  const [cleanupStatus, setCleanupStatus] = useState("idle"); // idle|running|done|error
  const [cleanupMsg, setCleanupMsg] = useState("");

  const log = (ok, msg) => setLaunchLog(prev => [...prev, {ok, msg}]);

  const confetti=Array.from({length:20},(_,i)=>({
    left:`${5+i*4.5}%`,delay:`${Math.random()*0.9}s`,
    color:[P.coral,P.teal,P.amber,P.indigo,"#F43F5E","#A8D8A8"][i%6],
    size:7+Math.random()*8,shape:i%3,
  }));

  const handleLaunch = useCallback(async () => {
    if (!wsConnected) {
      setLaunchStatus("error");
      setLaunchLog([]);
      setErrorMsg(
        wsState === "reconnecting"
          ? "Gateway 正在重连中，请稍等几秒后重试。"
          : "Gateway 未连接。请先在顶部填写/保存 Token 并连接成功后再启动。"
      );
      return;
    }

    setLaunchStatus("running");
    setLaunchLog([]);
    setErrorMsg("");

    const client = getGatewayClient();

    const ensureAgentDoc = async (agentId, filename, content) => {
      const relPath = agentFilePath(agentId, filename);
      try {
        await readFile(relPath);
        return false;
      } catch (e) {
        if (!(e instanceof Error) || !e.message.includes("404")) throw e;
        await writeFile(relPath, content);
        return true;
      }
    };

    // ── Step A: write SOUL.md files + scaffold docs ──────────────────────────
    for (const agent of agents) {
      const soul = souls[agent.label]?.trim();
      try {
        if (!soul) {
          log(true, `${agent.emoji} ${agent.label}：使用默认性格`);
        } else {
          await writeSoul(agent.agentId, soul);
          log(true, `${agent.emoji} ${agent.label}：性格说明书已保存 ✓`);
        }

        const agentsDoc = (agentsDocs?.[agent.label] || "").trim();
        const userDoc = (userDocs?.[agent.label] || "").trim();

        if (agentsDoc) {
          await writeFile(agentFilePath(agent.agentId, "AGENTS.md"), agentsDocs[agent.label]);
          log(true, `${agent.emoji} ${agent.label}：AGENTS.md 已保存 ✓`);
        } else {
          const createdAgents = await ensureAgentDoc(agent.agentId, "AGENTS.md", starterAgentsMd(agent.label));
          if (createdAgents) log(true, `${agent.emoji} ${agent.label}：已初始化 AGENTS.md`);
        }

        if (userDoc) {
          await writeFile(agentFilePath(agent.agentId, "USER.md"), userDocs[agent.label]);
          log(true, `${agent.emoji} ${agent.label}：USER.md 已保存 ✓`);
        } else {
          const createdUser = await ensureAgentDoc(agent.agentId, "USER.md", starterUserMd());
          if (createdUser) log(true, `${agent.emoji} ${agent.label}：已初始化 USER.md`);
        }
      } catch(e) {
        log(false, `${agent.emoji} ${agent.label}：文件写入失败 — ${e.message}`);
        setErrorMsg("文件写入失败，请检查文件服务器是否在运行（npm run dev）");
        setLaunchStatus("error");
        return;
      }
    }

    // ── Step B: config.get → get fresh hash ──────────────────────────────────
    let snapshot;
    try {
      log(true, "正在读取当前配置…");
      snapshot = await client.configGet();
      log(true, `配置读取成功（版本 ${snapshot.hash.slice(0,8)}…）`);
    } catch(e) {
      log(false, `读取配置失败：${e.message}`);
      setErrorMsg("无法连接到 OpenClaw Gateway，请确认它正在运行。");
      setLaunchStatus("error");
      return;
    }

    // ── Step C: build patch ──────────────────────────────────────────────────
    // Keep existing agents.defaults, only patch agents.list + bindings + session
    const cfgPath = String(snapshot.path || "");
    const cfgRoot = cfgPath.endsWith("/openclaw.json")
      ? cfgPath.slice(0, -"/openclaw.json".length)
      : "";
    const defaultsWorkspace = String(snapshot.config?.agents?.defaults?.workspace || "");
    const wsMatch = defaultsWorkspace.match(/^(.*)\/workspace(?:-[^/]+)?$/);
    const inferredRoot = wsMatch?.[1] || cfgRoot;
    const openclawRoot = inferredRoot || "/home/yufengw/.openclaw";

    const managedAgentEntry = (agentId, existing = {}) => ({
      ...existing,
      id: agentId,
      workspace: `${openclawRoot}/workspace-${agentId}`,
      agentDir: `${openclawRoot}/agents/${agentId}/agent`,
    });

    let newAgentList;
    if (editMode) {
      const existingList = (baseAgentList && baseAgentList.length > 0)
        ? baseAgentList
        : (snapshot.config?.agents?.list ?? []);
      const pickedIds = new Set(agents.map(a => a.agentId));
      const patchedPicked = agents.map(a => {
        const existing = existingList.find(item => item.id === a.agentId);
        return managedAgentEntry(a.agentId, existing ?? {});
      });
      const untouched = existingList.filter(item => !pickedIds.has(item.id));
      newAgentList = [...untouched, ...patchedPicked];
    } else {
      newAgentList = agents.map(a => managedAgentEntry(a.agentId));

      // Always keep "main" in the list if it's not being replaced
      const existingList = snapshot.config?.agents?.list ?? [];
      const hasMain = newAgentList.some(a => a.id === "main");
      if (!hasMain) {
        const existingMain = existingList.find(a => a.id === "main");
        if (existingMain) newAgentList.unshift(managedAgentEntry("main", existingMain));
      }
    }

    const mappedBindings = rules.map(r => {
      const tmpl = AGENT_TEMPLATES.find(t => t.label === r.agentLabel);
      return {
        agentId: tmpl?.agentId ?? r.agentLabel,
        match: r.channelId === "any"
          ? {}
          : { channel: r.channelId, accountId: "default" },
      };
    });

    const newBindings = editMode
      ? [
          ...(baseBindings || []).filter(b => !agents.some(a => a.agentId === b.agentId)),
          ...mappedBindings,
        ]
      : mappedBindings;

    const patch = {
      agents: { list: newAgentList },
      bindings: newBindings,
      session: { dmScope: privacy },
    };

    // ── Step D: config.patch ─────────────────────────────────────────────────
    try {
      log(true, "正在应用配置…");
      await client.configPatch({
        raw: JSON.stringify(patch, null, 2),
        baseHash: snapshot.hash,
        note: `OpenClawHelper: ${agents.map(a=>a.label).join(", ")}`,
        restartDelayMs: 2000,
      });
      log(true, "配置已写入，Gateway 正在重启（约 2 秒）…");
    } catch(e) {
      log(false, `配置写入失败：${e.message}`);
      setErrorMsg(e.message.includes("HASH_MISMATCH")
        ? "配置在你操作期间被其他程序修改了，请刷新页面重试。"
        : `写入失败：${e.message}`);
      setLaunchStatus("error");
      return;
    }

    // ── Step E: wait for restart, then verify ────────────────────────────────
    await new Promise(r => setTimeout(r, 2500));
    try {
      await client.configGet();
      log(true, "Gateway 重启完成，所有助手已上线 ✓");
      setLaunchStatus("success");
    } catch {
      // Gateway still restarting — not fatal, just note it
      log(true, "Gateway 重启中，稍后刷新页面可确认状态");
      setLaunchStatus("success");
    }
  }, [agents, souls, agentsDocs, userDocs, rules, privacy, writeSoul, readFile, writeFile, wsConnected, wsState, editMode, baseAgentList, baseBindings]);

  const cleanupOldMainSessions = useCallback(async () => {
    setCleanupStatus("running");
    setCleanupMsg("");
    try {
      const client = getGatewayClient();
      const routedChannels = Array.from(new Set((rules || [])
        .filter(r => r.channelId && r.channelId !== "any")
        .filter(r => (r.agent?.agentId ?? "") !== "main")
        .map(r => r.channelId)));

      if (routedChannels.length === 0) {
        setCleanupStatus("done");
        setCleanupMsg("没有可清理的旧 main 会话（当前没有路由到非 main 的指定渠道）。");
        return;
      }

      const listed = await client.sessionsList(300);
      const keys = (listed.sessions || []).map(s => s.key).filter(Boolean);

      const targets = keys.filter((key) =>
        routedChannels.some((ch) => key.startsWith(`agent:main:${ch}:`) || key === `agent:main:${ch}`)
      );

      if (targets.length === 0) {
        setCleanupStatus("done");
        setCleanupMsg("没有发现旧 main 会话需要清理。");
        return;
      }

      let ok = 0;
      for (const key of targets) {
        try {
          const res = await client.sessionsDelete(key);
          if (res?.ok) ok += 1;
        } catch {
          // continue cleanup best-effort
        }
      }

      setCleanupStatus("done");
      setCleanupMsg(`已清理 ${ok}/${targets.length} 个旧 main 会话。`);
    } catch (e) {
      setCleanupStatus("error");
      setCleanupMsg(`清理失败：${e?.message ?? String(e)}`);
    }
  }, [rules]);

  // ── Render: idle (summary) ─────────────────────────────────────────────────
  if (launchStatus === "idle") return (
    <div className="slide-up" style={{textAlign:"center",position:"relative",overflow:"hidden"}}>
      {confetti.map((c,i)=>(
        <div key={i} style={{position:"absolute",left:c.left,top:0,width:c.size,height:c.size,
          background:c.color,borderRadius:c.shape===0?"50%":c.shape===1?"3px":"0",
          animation:`confetti-fall 1.6s ${c.delay} ease forwards`,pointerEvents:"none"}}/>
      ))}
      <div style={{fontSize:60,marginBottom:8,animation:"float 3s ease-in-out infinite"}}>🎉</div>
      <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:30,color:P.ink,margin:"0 0 8px"}}>全部设好了！</h2>
      <p style={{fontSize:15,color:P.soft,marginBottom:28}}>检查一下配置，然后点启动 🚀</p>

      {/* Summary card */}
      <div style={{background:P.white,border:"3px solid #E8E8F5",borderRadius:24,
        padding:"22px 26px",textAlign:"left",marginBottom:24,boxShadow:"0 8px 30px #00000010"}}>
        <div style={{fontFamily:"Fredoka One,cursive",fontSize:17,color:P.ink,marginBottom:16}}>📋 配置摘要</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:800,color:P.soft,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>助手团队</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {agents.map(a=>{
              const[bg,border]=cardC(a.cardColor);
              const hasSoul=!!souls[a.label]?.trim();
              const soulPreview=souls[a.label]?.split("\n").find(l=>l.trim()&&!l.startsWith("#"))?.trim();
              return(
                <div key={a.label} style={{background:bg+"88",border:`2px solid ${border}`,borderRadius:12,padding:"10px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>{a.emoji}</span>
                    <span style={{fontFamily:"Fredoka One,cursive",fontSize:14,color:P.ink}}>{a.label}</span>
                    {hasSoul
                      ?<span style={{fontSize:11,color:P.teal,fontWeight:700,marginLeft:"auto"}}>✓ 性格已设定</span>
                      :<span style={{fontSize:11,color:P.soft,marginLeft:"auto"}}>（使用默认）</span>}
                  </div>
                  {soulPreview&&(
                    <div style={{marginTop:5,marginLeft:30,fontSize:11,color:P.soft,fontStyle:"italic",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      "{soulPreview}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {rules.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:800,color:P.soft,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>渠道分配</div>
            {rules.map((r,i)=>{
              const ch=CHANNEL_OPTIONS.find(c=>c.id===r.channelId);
              const[bg,border]=cardC(r.agent.cardColor);
              return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:P.ink,marginBottom:5}}>
                  <span>{ch?.emoji}</span><strong>{ch?.label}</strong>
                  <span style={{color:P.soft}}>→</span>
                  <Pill bg={bg} border={border}>{r.agent.emoji} {r.agentLabel}</Pill>
                </div>
              );
            })}
          </div>
        )}
        <div>
          <div style={{fontSize:11,fontWeight:800,color:P.soft,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>隐私模式</div>
          <Pill bg={privOpt?.color} border={privOpt?.border}>{privOpt?.emoji} {privOpt?.label}</Pill>
        </div>
      </div>

      {fsStatus === "offline" && (
        <div style={{background:"#FFF3E0",border:"2px solid #FFB74D",borderRadius:14,
          padding:"12px 18px",marginBottom:16,fontSize:13,color:"#E65100",fontWeight:600,
          display:"flex",alignItems:"center",gap:8}}>
          ⚠️ 文件服务器未连接，SOUL.md 将无法保存。请先运行 <code>npm run dev</code>
        </div>
      )}

      {!wsConnected && (
        <div style={{background:"#FFF0EE",border:"2px solid #FFB8A8",borderRadius:14,
          padding:"12px 18px",marginBottom:16,fontSize:13,color:"#8B2020",fontWeight:600,
          display:"flex",alignItems:"center",gap:8}}>
          {wsState === "reconnecting"
            ? "⏳ Gateway 重连中，请稍候再点击启动。"
            : "🔌 Gateway 未连接，请先保存 Token 并连接成功。"}
        </div>
      )}

      <div style={{display:"flex",gap:12,justifyContent:"center"}}>
        <Btn ghost onClick={onEdit} small>✏️ 重新编辑</Btn>
        <Btn color={P.teal} onClick={handleLaunch} disabled={!wsConnected}>🚀 启动助手系统</Btn>
      </div>
    </div>
  );

  // ── Render: running ────────────────────────────────────────────────────────
  if (launchStatus === "running") return (
    <div className="slide-up" style={{textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:12}} className="spin">⚙️</div>
      <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:P.ink,margin:"0 0 24px"}}>
        正在启动助手系统…
      </h2>
      <div style={{background:"#F8F8FF",border:"2px solid #E8E8F5",borderRadius:16,
        padding:"16px 20px",textAlign:"left",maxWidth:420,margin:"0 auto"}}>
        {launchLog.map((l,i)=>(
          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,
            padding:"5px 0",borderBottom:i<launchLog.length-1?"1px solid #F0F0F8":"none"}}>
            <span style={{fontSize:14,flexShrink:0}}>{l.ok?"✅":"❌"}</span>
            <span style={{fontSize:13,color:P.ink,lineHeight:1.5}}>{l.msg}</span>
          </div>
        ))}
        {launchLog.length > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,
            fontSize:13,color:P.soft,fontStyle:"italic"}}>
            <span className="spin" style={{fontSize:14}}>⏳</span> 请稍候…
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: success ────────────────────────────────────────────────────────
  if (launchStatus === "success") return (
    <div className="pop" style={{textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:12}}>✅</div>
      <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:28,color:P.teal,margin:"0 0 8px"}}>
        助手系统已启动！
      </h2>
      <p style={{fontSize:14,color:P.soft,marginBottom:20}}>所有助手已在后台运行，可以开始使用了</p>
      <div style={{background:"#EAFAF3",border:"2px solid #A8EDD0",borderRadius:14,
        padding:"14px 20px",display:"inline-flex",alignItems:"center",gap:10,
        fontSize:13,color:"#1A6A4A",fontWeight:700,marginBottom:24}}>
        <span style={{width:10,height:10,borderRadius:"50%",background:P.teal,display:"inline-block",boxShadow:`0 0 8px ${P.teal}`}}/>
        Gateway 已连接 · {agents.length} 个助手运行中
      </div>
      {/* Launch log */}
      <div style={{background:"#F8F8FF",border:"2px solid #E8E8F5",borderRadius:14,
        padding:"14px 18px",textAlign:"left",maxWidth:420,margin:"0 auto 14px"}}>
        {launchLog.map((l,i)=>(
          <div key={i} style={{display:"flex",gap:10,padding:"4px 0",fontSize:12,color:P.soft}}>
            <span>{l.ok?"✅":"❌"}</span><span>{l.msg}</span>
          </div>
        ))}
      </div>

      <div style={{background:"#FFF8E8",border:"2px solid #FFE0A3",borderRadius:14,
        padding:"12px 16px",maxWidth:420,margin:"0 auto 18px",textAlign:"left"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#8A6A00",marginBottom:6}}>🧹 可选：清理旧 main 会话</div>
        <div style={{fontSize:12,color:P.soft,lineHeight:1.5,marginBottom:10}}>
          防止之前旧线程继续粘在 main。建议首次切换路由后执行一次。
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <Btn small color={P.amber} onClick={cleanupOldMainSessions} disabled={cleanupStatus==="running"}>
            {cleanupStatus==="running"?"清理中…":"清理旧 main 会话"}
          </Btn>
          {cleanupMsg && <span style={{fontSize:11,color:cleanupStatus==="error"?P.coral:P.teal,fontWeight:700}}>{cleanupMsg}</span>}
        </div>
      </div>

      <Btn ghost onClick={onEdit} small>✏️ 修改配置</Btn>
    </div>
  );

  // ── Render: error ──────────────────────────────────────────────────────────
  return (
    <div className="pop" style={{textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:12}}>😟</div>
      <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:"#C0392B",margin:"0 0 8px"}}>
        启动遇到了问题
      </h2>
      <div style={{background:"#FFF0EE",border:"2px solid #FFB8A8",borderRadius:14,
        padding:"14px 18px",textAlign:"left",maxWidth:420,margin:"12px auto 20px",
        fontSize:13,color:"#8B2020",fontWeight:600,lineHeight:1.6}}>
        {errorMsg}
      </div>
      <div style={{background:"#F8F8FF",border:"2px solid #E8E8F5",borderRadius:14,
        padding:"14px 18px",textAlign:"left",maxWidth:420,margin:"0 auto 24px"}}>
        {launchLog.map((l,i)=>(
          <div key={i} style={{display:"flex",gap:10,padding:"4px 0",fontSize:12,
            color:l.ok?P.soft:"#C0392B",borderBottom:i<launchLog.length-1?"1px solid #F0F0F8":"none"}}>
            <span>{l.ok?"✅":"❌"}</span><span>{l.msg}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:12,justifyContent:"center"}}>
        <Btn ghost onClick={onEdit} small>← 重新编辑</Btn>
        <Btn color={P.coral} onClick={handleLaunch}>🔄 重试</Btn>
      </div>
    </div>
  );
}

// ── Connection status banner ───────────────────────────────────────────────────
function ConnectionBanner(){

  const [wsState, setWsState]   = useState("disconnected");
  const [fsStatus, setFsStatus] = useState("unknown");
  const { status } = useFileServer();

  useEffect(()=>{
    setFsStatus(status);
  },[status]);

  useEffect(()=>{
    const client = getGatewayClient();
    setWsState(client.state);
    return client.onStateChange(setWsState);
  },[]);

  const wsOk  = wsState === "connected";
  const fsOk  = fsStatus === "online";
  const allOk = wsOk && fsOk;

  return(
    <div style={{display:"flex",alignItems:"center",gap:8,
      background:allOk?"#EAFAF3":wsState==="connecting"||wsState==="reconnecting"?"#FFFBE8":"#FFF0EE",
      border:`2px solid ${allOk?"#A8EDD0":wsState==="connecting"||wsState==="reconnecting"?"#FFE066":"#FFB8A8"}`,
      borderRadius:14,padding:"7px 14px",fontSize:12,fontWeight:700,
      color:allOk?"#1A6A4A":wsState==="connecting"||wsState==="reconnecting"?"#8A6A00":"#8B2020",
      flexWrap:"wrap"}}>
      <span style={{display:"flex",alignItems:"center",gap:5}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:wsOk?P.teal:"#FFB899",
          display:"inline-block",boxShadow:wsOk?`0 0 6px ${P.teal}`:"none"}}/>
        Gateway {wsOk?"✓":wsState==="connecting"?"连接中…":wsState==="reconnecting"?"重连中…":"未连接"}
      </span>
      <span style={{color:"#C0C0D0"}}>|</span>
      <span style={{display:"flex",alignItems:"center",gap:5}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:fsOk?P.teal:"#FFB899",
          display:"inline-block",boxShadow:fsOk?`0 0 6px ${P.teal}`:"none"}}/>
        文件服务 {fsOk?"✓":fsStatus==="unknown"?"检测中…":"未启动"}
      </span>
    </div>
  );
}

function ConnectionSettings({wsState, token, setToken, onSaveToken, onReconnect}){
  const wsOk = wsState === "connected";
  return(
    <div style={{background:P.white,borderRadius:18,padding:"14px 16px",marginBottom:14,
      boxShadow:"0 4px 14px #0000000C",border:"2px solid #EBEBF8"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:12,fontWeight:800,color:P.soft,letterSpacing:1}}>🔐 Gateway 连接设置</div>
        <div style={{fontSize:12,fontWeight:700,color:wsOk?P.teal:(wsState==="reconnecting"?P.amber:P.coral)}}>
          {wsOk?"已连接":wsState==="reconnecting"?"重连中…":"未连接"}
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
        <input
          value={token}
          onChange={e=>setToken(e.target.value)}
          placeholder="粘贴 OpenClaw Gateway Token"
          style={{flex:1,minWidth:280,padding:"10px 12px",borderRadius:12,border:"2px solid #E8E8F5",
            fontSize:13,fontFamily:"Nunito,sans-serif",background:"#FAFAFE",color:P.ink}}
        />
        <Btn small color={P.indigo} onClick={onSaveToken}>💾 保存 Token</Btn>
        <Btn small color={P.teal} onClick={onReconnect}>🔄 重新连接</Btn>
      </div>
      <div style={{marginTop:8,fontSize:11,color:P.soft}}>
        Token 保存在浏览器 localStorage，仅本机使用。
      </div>
    </div>
  );
}

function ExistingAgentsPanel({wsState, onEditAgent}){
  const wsConnected = wsState === "connected";
  const { deleteAgentFiles } = useFileServer();
  const [agents, setAgents] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [hoverDeleteId, setHoverDeleteId] = useState("");

  const loadAgents = useCallback(async () => {
    if (!wsConnected) {
      setStatus("error");
      setMessage("Gateway 未连接，无法读取现有 Agents。请先连接。");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const client = getGatewayClient();
      const snapshot = await client.configGet();
      const list = snapshot.config?.agents?.list ?? [];
      setAgents(list.map((a) => {
        const tmpl = AGENT_TEMPLATES.find(t => t.agentId === a.id);
        return {
          id: a.id ?? "",
          label: tmpl?.label ?? a.id ?? "未命名 Agent",
          emoji: tmpl?.emoji ?? "🧩",
          cardColor: tmpl?.cardColor ?? 0,
          desc: tmpl?.desc ?? "点击进入编辑流程",
          supported: !!tmpl,
        };
      }));
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setMessage(`读取 Agents 失败：${e?.message ?? String(e)}`);
    }
  }, [wsConnected]);

  useEffect(() => {
    if (wsConnected) loadAgents();
  }, [wsConnected, loadAgents]);

  const handleDeleteAgent = useCallback(async (agentId) => {
    if (!agentId || agentId === "main") {
      setMessage("main 不能删除。");
      return;
    }

    const ok = window.confirm(`确认删除 Agent: ${agentId} ?\n\n将同时删除：\n- agents.list + bindings 引用\n- 该 Agent 会话\n- 该 Agent cron（默认）\n- ~/.openclaw/workspace-${agentId}\n- ~/.openclaw/agents/${agentId}`);
    if (!ok) return;

    setDeletingId(agentId);
    setMessage("正在删除，请稍候（Gateway 会短暂重启）…");

    try {
      const client = getGatewayClient();
      const snapshot = await client.configGet();

      const newAgentList = (snapshot.config?.agents?.list ?? []).filter(a => a.id !== agentId);
      const newBindings = (snapshot.config?.bindings ?? []).filter(b => b.agentId !== agentId);

      await client.configPatch({
        raw: JSON.stringify({ agents: { list: newAgentList }, bindings: newBindings }, null, 2),
        baseHash: snapshot.hash,
        note: `OpenClawHelper: delete agent ${agentId}`,
        restartDelayMs: 2000,
      });

      // Gateway may restart after config.patch; wait then continue best-effort cleanup.
      await new Promise(r => setTimeout(r, 2600));

      const warnings = [];

      try {
        const listed = await client.sessionsList(500);
        const keys = (listed.sessions || []).map(s => s.key).filter(Boolean);
        const targetKeys = keys.filter(k => k.startsWith(`agent:${agentId}:`) || k === `agent:${agentId}`);
        for (const key of targetKeys) {
          try { await client.sessionsDelete(key); } catch { /* best effort */ }
        }
      } catch (e) {
        warnings.push(`会话清理跳过：${e?.message ?? String(e)}`);
      }

      try {
        const cron = await client.cronList();
        const jobs = cron.jobs || [];
        const targetCronIds = jobs.filter(j => j.agentId === agentId).map(j => j.id).filter(Boolean);
        for (const id of targetCronIds) {
          try { await client.cronRemove(id); } catch { /* best effort */ }
        }
      } catch (e) {
        warnings.push(`cron 清理跳过：${e?.message ?? String(e)}`);
      }

      try {
        await deleteAgentFiles(agentId);
      } catch (e) {
        warnings.push(`目录清理失败：${e?.message ?? String(e)}`);
      }

      setMessage(
        warnings.length === 0
          ? `已删除 Agent ${agentId}（配置、会话、cron、目录已清理）。`
          : `已删除 Agent ${agentId}，但有告警：${warnings.join("；")}`
      );
      await loadAgents();
    } catch (e) {
      setMessage(`删除失败：${e?.message ?? String(e)}`);
    } finally {
      setDeletingId("");
    }
  }, [deleteAgentFiles, loadAgents]);

  return(
    <div style={{background:P.white,borderRadius:18,padding:"16px 18px",marginBottom:14,
      boxShadow:"0 4px 14px #0000000C",border:"2px solid #EBEBF8"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <div>
          <div style={{fontFamily:"Fredoka One,cursive",fontSize:18,color:P.ink}}>🧩 修改现有 Agents</div>
          <div style={{fontSize:12,color:P.soft}}>和下方创建流程同风格：先选卡片，再进入同一套编辑步骤</div>
        </div>
        <Btn small ghost onClick={loadAgents}>刷新列表</Btn>
      </div>

      {!wsConnected && <div style={{fontSize:12,color:P.coral,fontWeight:700}}>Gateway 未连接，连接后会自动加载。</div>}
      {wsConnected && status==="loading" && <div style={{fontSize:12,color:P.soft}}>正在读取 Agents…</div>}
      {wsConnected && agents.length===0 && status!=="loading" && <div style={{fontSize:12,color:P.soft}}>当前没有读取到 Agents 列表。</div>}

      {agents.length>0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginTop:8}}>
          {agents.map((a)=>{
            const [bg,border] = cardC(a.cardColor);
            const deleting = deletingId === a.id;
            return (
              <div key={a.id}
                onClick={()=>a.supported && !deleting && onEditAgent?.(a.id)}
                style={{background:a.supported?bg:P.white,border:`3px solid ${a.supported?border:"#EAEAF5"}`,
                  borderRadius:20,padding:"14px 12px",textAlign:"center",cursor:a.supported?"pointer":"not-allowed",
                  opacity:a.supported?1:0.65,boxShadow:a.supported?`0 6px 18px ${border}44`:"0 2px 8px #0000000A",
                  transition:"all 0.18s ease",position:"relative"}}>
                {a.id !== "main" && (
                  <>
                    <button
                      onMouseEnter={(e)=>{e.stopPropagation(); setHoverDeleteId(a.id);}}
                      onMouseLeave={(e)=>{e.stopPropagation(); setHoverDeleteId("");}}
                      onClick={(e)=>{e.stopPropagation(); if(!deletingId) handleDeleteAgent(a.id);}}
                      style={{
                        position:"absolute",
                        top:-10,
                        right:-10,
                        width:30,
                        height:30,
                        borderRadius:"50%",
                        border:"3px solid #fff",
                        background:deleting?"#FFB4A6":(hoverDeleteId===a.id?"#FF5D40":P.coral),
                        color:"#fff",
                        fontSize:14,
                        fontWeight:900,
                        cursor:deletingId?"wait":"pointer",
                        lineHeight:1,
                        boxShadow:hoverDeleteId===a.id?"0 8px 20px #FF6B4A66":"0 4px 10px #FF6B4A44",
                        transform:hoverDeleteId===a.id?"scale(1.08)":"scale(1)",
                        transition:"all 0.18s ease",
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"center",
                      }}>
                      {deleting?"…":"✕"}
                    </button>
                    {hoverDeleteId===a.id && (
                      <div style={{
                        position:"absolute",
                        top:-44,
                        right:6,
                        background:"#FFF0EE",
                        border:"2px solid #FFB8A8",
                        color:"#8B2020",
                        borderRadius:12,
                        padding:"6px 10px",
                        fontSize:11,
                        fontWeight:800,
                        boxShadow:"0 6px 16px #FF6B4A33",
                        whiteSpace:"nowrap",
                        pointerEvents:"none",
                      }}>
                        删除 {a.id}
                      </div>
                    )}
                  </>
                )}
                <div style={{fontSize:30,marginBottom:6}}>{a.emoji}</div>
                <div style={{fontFamily:"Fredoka One,cursive",fontSize:15,color:P.ink,marginBottom:4}}>{a.label}</div>
                <div style={{fontSize:11,color:P.soft,lineHeight:1.4}}>{a.supported?a.desc:"该 Agent 暂不支持可视化编辑"}</div>
              </div>
            );
          })}
        </div>
      )}

      {message && <div style={{marginTop:10,fontSize:12,fontWeight:700,color:message.startsWith("已删除")?P.teal:P.coral}}>{message}</div>}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [step,    setStep]    = useState(1);
  const [picked,  setPicked]  = useState([]);
  const [souls,   setSouls]   = useState({});
  const [agentsDocs, setAgentsDocs] = useState({});
  const [userDocs, setUserDocs] = useState({});
  const [rules,   setRules]   = useState([]);
  const [privacy, setPrivacy] = useState("per-channel-peer");
  const [wsState, setWsState] = useState("disconnected");
  const [token, setToken] = useState(() => localStorage.getItem("openclaw_token") ?? "");
  const [editMode, setEditMode] = useState(false);
  const [baseAgentList, setBaseAgentList] = useState([]);
  const [baseBindings, setBaseBindings] = useState([]);
  const { readFile } = useFileServer();

  const connectGateway = useCallback((nextToken) => {
    const client = getGatewayClient();
    client.connect("ws://127.0.0.1:18789", nextToken || undefined).catch(()=>{});
  }, []);

  const saveToken = useCallback(() => {
    localStorage.setItem("openclaw_token", token.trim());
    connectGateway(token.trim());
  }, [token, connectGateway]);

  const reconnect = useCallback(() => {
    connectGateway((localStorage.getItem("openclaw_token") ?? token).trim());
  }, [connectGateway, token]);

  // Auto-connect to Gateway on mount
  useEffect(()=>{
    const client = getGatewayClient();
    setWsState(client.state);
    const unsub = client.onStateChange(setWsState);
    if(client.state === "disconnected"){
      connectGateway((localStorage.getItem("openclaw_token") ?? "").trim());
    }
    return unsub;
  },[connectGateway]);

  const startEditExistingAgent = useCallback(async (agentId) => {
    const tmpl = AGENT_TEMPLATES.find(t => t.agentId === agentId);
    if (!tmpl) return;

    const client = getGatewayClient();
    const snapshot = await client.configGet();

    setEditMode(true);
    setPicked([tmpl.label]);

    const loadDoc = async (filename, fallback = "") => {
      try {
        const f = await readFile(agentFilePath(agentId, filename));
        return f.content || fallback;
      } catch {
        return fallback;
      }
    };

    const loadedSoul = await loadDoc("SOUL.md", souls[tmpl.label] ?? "");
    const loadedAgents = await loadDoc("AGENTS.md", starterAgentsMd(tmpl.label));
    const loadedUser = await loadDoc("USER.md", starterUserMd());

    setSouls({ [tmpl.label]: loadedSoul });
    setAgentsDocs({ [tmpl.label]: loadedAgents });
    setUserDocs({ [tmpl.label]: loadedUser });
    setPrivacy(snapshot.config?.session?.dmScope ?? "per-channel-peer");

    const list = snapshot.config?.agents?.list ?? [];
    const bindings = snapshot.config?.bindings ?? [];
    setBaseAgentList(list);
    setBaseBindings(bindings);

    const existingRules = bindings
      .filter(b => b.agentId === agentId)
      .map(b => ({
        agentLabel: tmpl.label,
        channelId: b?.match?.channel || "any",
        agent: tmpl,
      }));

    setRules(existingRules);
    setStep(2);
  }, [souls, readFile]);

  return(
    <>
      <style>{FONT_STYLE}</style>
      <div style={{minHeight:"100vh",
        background:"radial-gradient(ellipse at 25% 15%,#EBF0FF 0%,#F4F6FF 45%,#FFF5EE 100%)",
        fontFamily:"Nunito,sans-serif",color:P.ink,paddingBottom:60}}>

        {/* Header */}
        <div style={{background:P.white,borderBottom:"3px solid #EBEBF8",padding:"14px 28px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          boxShadow:"0 4px 18px #00000008"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:13,
              background:`linear-gradient(135deg,${P.indigo},${P.coral})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:20,boxShadow:`0 4px 12px ${P.indigo}44`}}>🐾</div>
            <div>
              <div style={{fontFamily:"Fredoka One,cursive",fontSize:18,color:P.ink,lineHeight:1.1}}>
                OpenClaw 助手配置
              </div>
              <div style={{fontSize:11,color:P.soft,fontWeight:600}}>Multi-Agent Setup Wizard</div>
            </div>
          </div>
          <ConnectionBanner/>
        </div>

        {/* Main */}
        <div style={{maxWidth:700,margin:"36px auto 0",padding:"0 20px"}}>
          <div style={{background:P.white,borderRadius:22,padding:"20px 28px",marginBottom:14,
            boxShadow:"0 4px 18px #00000010",border:"2px solid #EBEBF8"}}>
            <StepBar current={step}/>
          </div>

          <ConnectionSettings
            wsState={wsState}
            token={token}
            setToken={setToken}
            onSaveToken={saveToken}
            onReconnect={reconnect}
          />

          <ExistingAgentsPanel
            wsState={wsState}
            onEditAgent={(agentId)=>{ startEditExistingAgent(agentId).catch(()=>{}); }}
          />

          <div style={{background:P.white,borderRadius:28,padding:"34px 36px",
            boxShadow:"0 8px 40px #00000012",border:"2px solid #EBEBF8"}}>
            {step===1&&<Step1 picked={picked}
              onToggle={l=>{setEditMode(false);setPicked(p=>p.includes(l)?p.filter(x=>x!==l):[...p,l]);}}
              onNext={()=>{setEditMode(false);setStep(2);}}/>}
            {step===2&&<Step2 picked={picked} souls={souls} agentsDocs={agentsDocs} userDocs={userDocs}
              onSoulChange={(l,v)=>setSouls(s=>({...s,[l]:v}))}
              onAgentsDocChange={(l,v)=>setAgentsDocs(s=>({...s,[l]:v}))}
              onUserDocChange={(l,v)=>setUserDocs(s=>({...s,[l]:v}))}
              onNext={()=>setStep(3)} onBack={()=>setStep(1)}/>}
            {step===3&&<Step3 picked={picked} rules={rules}
              onAddRule={r=>setRules(p=>[...p,r])}
              onRemoveRule={(al,ch)=>setRules(p=>p.filter(r=>!(r.agentLabel===al&&r.channelId===ch)))}
              onNext={()=>setStep(4)} onBack={()=>setStep(2)}/>}
            {step===4&&<Step4 privacy={privacy} setPrivacy={setPrivacy}
              onNext={()=>setStep(5)} onBack={()=>setStep(3)}/>}
            {step===5&&<Step5 picked={picked} souls={souls} agentsDocs={agentsDocs} userDocs={userDocs} rules={rules}
              privacy={privacy}
              onEdit={()=>setStep(1)}
              wsConnected={wsState==="connected"}
              wsState={wsState}
              editMode={editMode}
              baseAgentList={baseAgentList}
              baseBindings={baseBindings}
            />}
          </div>
        </div>
      </div>
    </>
  );
}
