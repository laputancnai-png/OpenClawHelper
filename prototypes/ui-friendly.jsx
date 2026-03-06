import { useState } from "react";

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
  .pop       { animation: pop 0.22s ease forwards; }
  .float     { animation: float 3.2s ease-in-out infinite; }
  .slide-up  { animation: slide-up 0.2s ease forwards; }

  textarea:focus, input:focus { outline: none; }
  textarea::placeholder, input::placeholder { color: #B8B8D0; }
  button { font-family: "Nunito", sans-serif; }
`;

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  bg:     "#F4F6FF",
  white:  "#FFFFFF",
  ink:    "#1F1F30",
  soft:   "#7878A0",
  border: "#E4E4F4",
  indigo: "#5B5FEF",
  teal:   "#18B989",
  coral:  "#FF6B4A",
  amber:  "#F59E0B",
  cards: [
    ["#EDE8FF","#C5B8FF","#7C5FEA"],
    ["#DCF5FF","#90D8FF","#2AA8D8"],
    ["#FFE8DA","#FFB899","#E8713A"],
    ["#D8F7EC","#7FE8C4","#18B989"],
    ["#FFF8D0","#FFE066","#C8950A"],
    ["#FFE0F0","#FFAACC","#D8408A"],
  ],
};

// ── Agent templates ────────────────────────────────────────────────────────────
const AGENT_TEMPLATES = [
  {
    emoji:"🧠", label:"聪明管家", cardColor:0,
    desc:"负责理解你的问题，分配给合适的小助手",
    soulStarter:`# 聪明管家

## 角色
你是一位高效的任务协调员。你会先理解用户想要做什么，然后把任务分配给最合适的专业助手。

## 行为准则
- 先问清楚用户的目标，再决定找哪位助手
- 用简洁友好的语气和用户沟通
- 如果你不确定找哪位助手，就直接自己回答

## 禁忌
- 不要让用户感到困惑或等待太久`,
  },
  {
    emoji:"💻", label:"代码专家", cardColor:1,
    desc:"帮你检查和修改代码，找出 bug",
    soulStarter:`# 代码专家

## 角色
你是一位经验丰富的程序员助手。你擅长找到代码里的问题、解释复杂的技术概念、写出简洁易懂的代码。

## 风格
- 先说结论，再解释原因
- 给出代码示例时附上注释
- 像老师一样耐心，但不啰嗦

## 禁忌
- 不要写出难以维护的代码
- 不要假设用户懂很多术语`,
  },
  {
    emoji:"✍️", label:"写作助手", cardColor:2,
    desc:"帮你写文章、邮件、公众号",
    soulStarter:`# 写作助手

## 角色
你是一位资深的公众号写作专家，擅长用犀利、真实的视角剖析技术话题。

## 风格
- 开头必须用一个引人入胜的场景或反直觉的观点
- 段落短小精悍，移动端阅读友好
- 善用类比，让小学生也能听懂复杂概念
- 结尾必须有行动号召（CTA）

## 禁忌
- 不使用"众所周知""不言而喻"等空洞词汇
- 不堆砌术语，每个专业名词第一次出现时必须解释`,
  },
  {
    emoji:"🔍", label:"资料搜集", cardColor:3,
    desc:"上网找信息，整理成清晰的摘要",
    soulStarter:`# 资料搜集助手

## 角色
你是一位细心的研究员，擅长快速找到可靠的信息并整理成清晰的摘要。

## 行为准则
- 给出信息来源
- 区分事实和观点
- 用要点式呈现，方便快速浏览`,
  },
  {
    emoji:"🎨", label:"创意顾问", cardColor:4,
    desc:"头脑风暴、想创意、出点子",
    soulStarter:`# 创意顾问

## 角色
你是一位充满想象力的创意伙伴，专门帮用户突破思维定式，找到新鲜的想法。

## 风格
- 多提选项，不只给一个答案
- 鼓励大胆想法，再一起打磨
- 用提问引导用户发现自己的想法`,
  },
  {
    emoji:"📊", label:"数据助手", cardColor:5,
    desc:"处理表格、数字，帮你看懂数据",
    soulStarter:`# 数据助手

## 角色
你是一位专业的数据分析师，擅长把复杂的数字和表格变成人人都能看懂的结论。

## 风格
- 先说最重要的结论
- 用图表或简单的数字说明问题
- 避免让人看不懂的统计学术语`,
  },
];

const CHANNEL_OPTIONS = [
  { id:"discord",  emoji:"🎮", label:"Discord"  },
  { id:"telegram", emoji:"✈️", label:"Telegram" },
  { id:"whatsapp", emoji:"💬", label:"WhatsApp" },
  { id:"slack",    emoji:"⚡", label:"Slack"    },
  { id:"any",      emoji:"🌐", label:"所有渠道"  },
];

const PRIVACY_OPTIONS = [
  { id:"per-channel-peer", emoji:"🏠", label:"每个人独立",
    desc:"每个人和助手说的话完全分开，互不干扰。大多数情况推荐用这个！",
    color:"#D8F7EC", border:"#7FE8C4", recommended:true },
  { id:"per-peer", emoji:"👤", label:"按联系人分开",
    desc:"同一个人在不同地方发的消息会共享记忆。适合一对一使用。",
    color:"#DCF5FF", border:"#90D8FF" },
  { id:"main", emoji:"🌍", label:"所有人共享",
    desc:"大家的对话都在一起，助手能看到所有人说的话。只适合自己一个人用！",
    color:"#FFE8DA", border:"#FFB899", warn:true },
];

const cardC = (idx) => P.cards[idx % P.cards.length];

// ── Tiny helpers ───────────────────────────────────────────────────────────────
function Pill({ bg, border, children, style }) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:4,
      background:bg, border:`2px solid ${border}`,
      borderRadius:20,padding:"3px 12px",
      fontSize:13,fontWeight:700,color:P.ink,...style,
    }}>{children}</span>
  );
}

function Btn({ children, onClick, color=P.indigo, ghost, small, disabled, style }) {
  const [hov,setHov]=useState(false);
  if(ghost) return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:hov?"#F0F0F8":P.white,color:P.soft,
        border:"2px solid #E0E0F0",borderRadius:14,
        padding:small?"6px 14px":"11px 24px",
        fontSize:small?12:14,fontWeight:700,cursor:"pointer",
        transition:"all 0.15s",...style}}>
      {children}
    </button>
  );
  return (
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

// ── Step bar ──────────────────────────────────────────────────────────────────
const STEPS=[{n:1,emoji:"🤖",label:"选助手"},{n:2,emoji:"✨",label:"写性格"},
             {n:3,emoji:"🔗",label:"连渠道"},{n:4,emoji:"🔒",label:"隐私"},{n:5,emoji:"🚀",label:"完成"}];

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

// ── Step 1: Pick ───────────────────────────────────────────────────────────────
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
          const [bg,border,dot]=cardC(t.cardColor);
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
          <span style={{fontSize:16}}>⭐</span>
          <span style={{fontWeight:700,color:P.ink,fontSize:13}}>已选：</span>
          {picked.map(l=>{const t=AGENT_TEMPLATES.find(x=>x.label===l);const[bg,border]=cardC(t.cardColor);
            return <Pill key={l} bg={bg} border={border}>{t.emoji} {l}</Pill>;})}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <Btn onClick={onNext} disabled={picked.length===0}>下一步：写助手性格 →</Btn>
      </div>
    </div>
  );
}

// ── Step 2: SOUL editor ────────────────────────────────────────────────────────
const EASY_FIELDS=[
  {key:"personality",icon:"😊",label:"性格",ph:"这个助手的性格是什么？活泼？严谨？幽默？"},
  {key:"skills",     icon:"🎯",label:"专长",ph:"它最擅长什么？有什么特别的技能？"},
  {key:"tone",       icon:"💬",label:"说话方式",ph:"它怎么和用户说话？正式还是轻松？"},
  {key:"forbidden",  icon:"🚫",label:"不能做",ph:"有什么它绝对不该做的事情？"},
];

function SoulEditor({agent,soul,onChange}){
  const t=AGENT_TEMPLATES.find(x=>x.label===agent.label);
  const [bg,border,dot]=cardC(t.cardColor);
  const [tab,setTab]=useState("easy");
  const [easy,setEasy]=useState({personality:"",skills:"",tone:"",forbidden:""});
  const [previewOpen,setPreviewOpen]=useState(false);

  const buildFromEasy=(e)=>[
    `# ${agent.label}`,
    ``,
    `## 性格`,
    e.personality||"（未填写）",
    ``,
    `## 专长`,
    e.skills||"（未填写）",
    ``,
    `## 说话方式`,
    e.tone||"（未填写）",
    ``,
    `## 禁忌`,
    e.forbidden||"（未填写）",
  ].join("\n");

  const handleEasy=(key,val)=>{
    const next={...easy,[key]:val};
    setEasy(next);
    onChange(buildFromEasy(next));
  };

  // Generate a friendly preview sentence from soul content
  const getPreviewLine=()=>{
    if(!soul) return `你好！我是${t.label}，很高兴认识你！`;
    const toneMatch=soul.match(/说话方式[\s\S]*?\n([^#\n].+)/);
    const personalityMatch=soul.match(/性格[\s\S]*?\n([^#\n].+)/);
    const line=(toneMatch||personalityMatch)?.[1]?.trim();
    if(line) return `（${line}风格的助手）`;
    return `你好！我是${t.label}，请告诉我你需要什么帮助！`;
  };

  const wordCount=soul?.trim().length||0;
  const fillLevel=Math.min(100,Math.round(wordCount/3));
  const fillColor=fillLevel<20?"#FFB899":fillLevel<60?"#FFE066":dot;

  return(
    <div style={{background:P.white,border:`3px solid ${border}`,
      borderRadius:22,overflow:"hidden",boxShadow:`0 6px 24px ${border}55`}}>

      {/* Card header */}
      <div style={{background:bg,padding:"16px 20px",borderBottom:`2px solid ${border}66`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:48,height:48,borderRadius:16,background:P.white,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:26,boxShadow:`0 4px 12px ${border}88`}}>
            {t.emoji}
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"Fredoka One,cursive",fontSize:18,color:P.ink}}>{t.label}</div>
            <div style={{fontSize:12,color:P.soft}}>给这个助手写一份「性格说明书」</div>
          </div>
          {/* Fill meter */}
          <div style={{textAlign:"center",minWidth:60}}>
            <div style={{fontSize:11,color:P.soft,fontWeight:700,marginBottom:4}}>
              {fillLevel<20?"还没写":"写得不错"}{fillLevel>=80?" 🌟":""}
            </div>
            <div style={{width:60,height:8,background:"#0000001A",borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${fillLevel}%`,background:fillColor,
                borderRadius:4,transition:"width 0.4s ease, background 0.3s"}}/>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{display:"flex",gap:0,background:"#0000001A",borderRadius:12,padding:3,marginTop:14,width:"fit-content"}}>
          {[["easy","✨ 简单模式"],["advanced","✏️ 自由编辑"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{background:tab===id?"#fff":"none",border:"none",borderRadius:10,
                padding:"7px 16px",fontSize:13,fontWeight:700,cursor:"pointer",
                color:tab===id?P.ink:P.soft,transition:"all 0.15s",
                boxShadow:tab===id?"0 2px 8px #00000015":"none"}}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{padding:"20px 22px"}}>
        {tab==="easy"&&(
          <div className="slide-up">
            <div style={{background:"#F0F4FF",borderRadius:12,padding:"10px 14px",
              fontSize:13,color:"#4050A0",fontWeight:600,marginBottom:16,
              display:"flex",alignItems:"flex-start",gap:8,lineHeight:1.5}}>
              <span style={{fontSize:16}}>💡</span>
              <span>像介绍朋友一样填写吧！越详细，助手越懂你。不会写？直接点"用模板"也行～</span>
            </div>
            {EASY_FIELDS.map(f=>(
              <div key={f.key} style={{marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:P.soft,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                  <span>{f.icon}</span>{f.label}
                </div>
                <input value={easy[f.key]} onChange={e=>handleEasy(f.key,e.target.value)}
                  placeholder={f.ph}
                  style={{width:"100%",padding:"11px 14px",borderRadius:12,
                    border:"2px solid #E8E8F5",fontSize:13,fontFamily:"Nunito,sans-serif",
                    transition:"border 0.15s",color:P.ink,background:"#FAFAFE"}}
                  onFocus={e=>e.target.style.borderColor=dot}
                  onBlur={e=>e.target.style.borderColor="#E8E8F5"}/>
              </div>
            ))}
            <div style={{marginTop:18,padding:"14px 16px",background:"#F8F8FF",
              border:"2px dashed #D0D0EE",borderRadius:14,
              display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:13,color:P.ink,marginBottom:2}}>📋 用专业模板</div>
                <div style={{fontSize:12,color:P.soft}}>一键填入精心写好的角色设定，你可以再修改</div>
              </div>
              <Btn small color={dot} onClick={()=>{onChange(t.soulStarter);setEasy({personality:"",skills:"",tone:"",forbidden:""});setTab("advanced");}}>
                用模板 →
              </Btn>
            </div>
          </div>
        )}

        {tab==="advanced"&&(
          <div className="slide-up">
            <div style={{background:"#FAFAFE",borderRadius:12,padding:"10px 14px",
              fontSize:13,color:P.soft,marginBottom:12,display:"flex",alignItems:"flex-start",gap:8,lineHeight:1.5}}>
              <span style={{fontSize:16}}>📝</span>
              <span>直接编辑助手的「性格说明书」，用任何格式写都行，越详细越好。助手每次开口前都会读一遍它。</span>
            </div>
            <textarea value={soul} onChange={e=>onChange(e.target.value)} rows={11}
              placeholder={t.soulStarter}
              style={{width:"100%",padding:"14px 16px",borderRadius:14,
                border:"2px solid #E8E8F5",fontSize:13,
                fontFamily:"'Courier New',Courier,monospace",
                lineHeight:1.7,resize:"vertical",background:"#FCFCFF",
                color:P.ink,transition:"border 0.15s"}}
              onFocus={e=>e.target.style.borderColor=dot}
              onBlur={e=>e.target.style.borderColor="#E8E8F5"}/>
            <div style={{marginTop:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:fillLevel<20?P.soft:fillLevel<60?P.amber:P.teal,fontWeight:700}}>
                {fillLevel<20?"💬 写几句就够用了":""}
                {fillLevel>=20&&fillLevel<60?"✏️ 写得挺好，继续加！":""}
                {fillLevel>=60?"🌟 很详细，助手会非常聪明！":""}
              </div>
              <div style={{fontSize:11,color:P.soft}}>{wordCount} 字</div>
            </div>
          </div>
        )}

        {/* Live preview bubble */}
        {soul&&soul.trim()&&(
          <div style={{marginTop:16,padding:"14px 16px",
            background:`${bg}BB`,border:`2px solid ${border}`,
            borderRadius:16,position:"relative"}}>
            <div style={{fontSize:11,fontWeight:800,color:dot,marginBottom:8,letterSpacing:0.5}}>
              👀 助手会这样打招呼：
            </div>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <div style={{width:32,height:32,borderRadius:10,background:P.white,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:18,flexShrink:0,border:`2px solid ${border}`}}>
                {t.emoji}
              </div>
              <div style={{background:P.white,border:`2px solid ${border}`,
                borderRadius:"0 14px 14px 14px",padding:"10px 14px",
                fontSize:13,color:P.ink,lineHeight:1.5,fontStyle:"italic",maxWidth:"90%"}}>
                {getPreviewLine()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step2({picked,souls,onSoulChange,onNext,onBack}){
  const agents=AGENT_TEMPLATES.filter(t=>picked.includes(t.label));
  const [cur,setCur]=useState(0);
  const agent=agents[cur];
  return(
    <div className="slide-up">
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:44,marginBottom:8}}>✨</div>
        <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:P.ink,margin:"0 0 6px"}}>
          给每个助手写「性格说明书」
        </h2>
        <p style={{fontSize:14,color:P.soft,margin:0}}>告诉助手它是谁、怎么说话——就像介绍一个新同事</p>
      </div>

      {agents.length>1&&(
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {agents.map((a,i)=>{
            const[bg,border]=cardC(a.cardColor);
            const has=!!souls[a.label]?.trim();
            return(
              <button key={a.label} onClick={()=>setCur(i)}
                style={{display:"flex",alignItems:"center",gap:7,
                  background:i===cur?bg:P.white,border:`2.5px solid ${i===cur?border:"#E8E8F5"}`,
                  borderRadius:14,padding:"8px 14px",cursor:"pointer",transition:"all 0.15s"}}>
                <span style={{fontSize:18}}>{a.emoji}</span>
                <span style={{fontWeight:700,fontSize:13,color:P.ink}}>{a.label}</span>
                {has&&<span style={{fontSize:10,color:P.teal}}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      <SoulEditor agent={agent} soul={souls[agent.label]||""} onChange={v=>onSoulChange(agent.label,v)}/>

      <div style={{display:"flex",justifyContent:"space-between",marginTop:24}}>
        <Btn ghost onClick={onBack}>← 上一步</Btn>
        <Btn onClick={onNext} color={P.indigo}>
          {cur<agents.length-1?`下一个：${agents[cur+1].label} →`:"下一步：连接渠道 →"}
        </Btn>
      </div>
    </div>
  );
}

// ── Step 3: Channels ───────────────────────────────────────────────────────────
function Step3({picked,rules,onAddRule,onRemoveRule,onNext,onBack}){
  const agents=AGENT_TEMPLATES.filter(t=>picked.includes(t.label));
  const [dragging,setDragging]=useState(null);
  const [hovering,setHovering]=useState(null);

  return(
    <div className="slide-up">
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:44,marginBottom:8}}>🔗</div>
        <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:26,color:P.ink,margin:"0 0 6px"}}>
          把助手拖到对应的渠道上
        </h2>
        <p style={{fontSize:14,color:P.soft,margin:0}}>哪个渠道发来的消息，就由哪个助手来回答</p>
      </div>

      <div style={{display:"flex",gap:20,marginBottom:20}}>
        {/* Drag source */}
        <div style={{flexShrink:0,width:168}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:1,color:P.soft,marginBottom:10,textTransform:"uppercase"}}>📦 助手</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {agents.map(a=>{
              const[bg,border]=cardC(a.cardColor);
              const isDragging=dragging===a.label;
              return(
                <div key={a.label} draggable
                  onDragStart={()=>setDragging(a.label)}
                  onDragEnd={()=>{setDragging(null);setHovering(null);}}
                  style={{background:isDragging?bg:P.white,border:`3px solid ${isDragging?border:"#E8E8F5"}`,
                    borderRadius:16,padding:"11px 14px",
                    display:"flex",alignItems:"center",gap:10,
                    cursor:"grab",userSelect:"none",
                    transform:isDragging?"scale(1.06) rotate(-2deg)":"scale(1)",
                    boxShadow:isDragging?`0 8px 24px ${border}88`:"0 2px 6px #0000000A",
                    transition:"all 0.15s"}}>
                  <span style={{fontSize:22}}>{a.emoji}</span>
                  <span style={{fontFamily:"Fredoka One,cursive",fontSize:14,color:P.ink,flex:1}}>{a.label}</span>
                  <span style={{color:P.soft,fontSize:14}}>⠿</span>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:14,background:"#F0F4FF",borderRadius:12,padding:"10px 12px",
            fontSize:12,color:"#4058B0",fontWeight:600,lineHeight:1.5}}>
            💡 拖到右边的渠道框里，一个助手可以负责多个渠道
          </div>
        </div>

        {/* Drop zones */}
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:1,color:P.soft,marginBottom:10,textTransform:"uppercase"}}>📡 渠道</div>
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
                      if(a&&!rules.some(r=>r.agentLabel===dragging&&r.channelId===ch.id)){
                        onAddRule({agentLabel:dragging,channelId:ch.id,agent:a});
                      }
                    }
                    setDragging(null);setHovering(null);
                  }}
                  style={{minHeight:56,background:isHov?"#EEF0FF":"#FAFAFE",
                    border:`3px dashed ${isHov?P.indigo:"#D8D8F0"}`,
                    borderRadius:16,padding:"10px 14px",
                    display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",
                    transition:"all 0.15s",transform:isHov?"scale(1.01)":"scale(1)"}}>
                  <span style={{fontSize:20}}>{ch.emoji}</span>
                  <span style={{fontFamily:"Fredoka One,cursive",fontSize:14,color:P.ink,minWidth:68}}>{ch.label}</span>
                  {assigned.length===0&&(
                    <span style={{fontSize:12,color:"#C8C8E0",fontStyle:"italic"}}>拖一个助手到这里…</span>
                  )}
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
                border:`3px solid ${on?opt.border:"#C8C8E0"}`,
                background:on?opt.border:P.white,
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

// ── Step 5: Done ───────────────────────────────────────────────────────────────
function Step5({picked,souls,rules,privacy,onEdit}){
  const agents=AGENT_TEMPLATES.filter(t=>picked.includes(t.label));
  const privOpt=PRIVACY_OPTIONS.find(p=>p.id===privacy);
  const [launched,setLaunched]=useState(false);
  const confetti=Array.from({length:20},(_,i)=>({
    left:`${5+i*4.5}%`,delay:`${Math.random()*0.9}s`,
    color:[P.coral,P.teal,P.amber,P.indigo,"#F43F5E","#A8D8A8"][i%6],
    size:7+Math.random()*8,shape:i%3,
  }));

  return(
    <div className="slide-up" style={{textAlign:"center",position:"relative",overflow:"hidden"}}>
      {confetti.map((c,i)=>(
        <div key={i} style={{position:"absolute",left:c.left,top:0,
          width:c.size,height:c.size,background:c.color,
          borderRadius:c.shape===0?"50%":c.shape===1?"3px":"0",
          animation:`confetti-fall 1.6s ${c.delay} ease forwards`,
          pointerEvents:"none"}}/>
      ))}

      {!launched?(
        <>
          <div style={{fontSize:60,marginBottom:8,animation:"float 3s ease-in-out infinite"}}>🎉</div>
          <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:30,color:P.ink,margin:"0 0 8px"}}>全部设好了！</h2>
          <p style={{fontSize:15,color:P.soft,marginBottom:28}}>你的 AI 助手团队已经准备好了 ✨</p>

          <div style={{background:P.white,border:"3px solid #E8E8F5",borderRadius:24,
            padding:"22px 26px",textAlign:"left",marginBottom:24,boxShadow:"0 8px 30px #00000010"}}>
            <div style={{fontFamily:"Fredoka One,cursive",fontSize:17,color:P.ink,marginBottom:16}}>📋 配置摘要</div>

            {/* Agents */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:800,color:P.soft,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>助手团队</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {agents.map(a=>{
                  const[bg,border]=cardC(a.cardColor);
                  const hasSoul=!!souls[a.label]?.trim();
                  const soulPreview=souls[a.label]?.split("\n").find(l=>l.trim()&&!l.startsWith("#"))?.trim();
                  return(
                    <div key={a.label} style={{background:bg+"88",border:`2px solid ${border}`,
                      borderRadius:12,padding:"10px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:20}}>{a.emoji}</span>
                        <span style={{fontFamily:"Fredoka One,cursive",fontSize:14,color:P.ink}}>{a.label}</span>
                        {hasSoul
                          ?<span style={{fontSize:11,color:P.teal,fontWeight:700,marginLeft:"auto"}}>✓ 性格已设定</span>
                          :<span style={{fontSize:11,color:P.soft,marginLeft:"auto"}}>（使用默认）</span>}
                      </div>
                      {soulPreview&&(
                        <div style={{marginTop:5,marginLeft:30,fontSize:11,color:P.soft,
                          fontStyle:"italic",lineHeight:1.4,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          "{soulPreview}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rules */}
            {rules.length>0&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:800,color:P.soft,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>渠道分配</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {rules.map((r,i)=>{
                    const ch=CHANNEL_OPTIONS.find(c=>c.id===r.channelId);
                    const[bg,border]=cardC(r.agent.cardColor);
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:P.ink}}>
                        <span>{ch?.emoji}</span><strong>{ch?.label}</strong>
                        <span style={{color:P.soft}}>→</span>
                        <Pill bg={bg} border={border}>{r.agent.emoji} {r.agentLabel}</Pill>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Privacy */}
            <div>
              <div style={{fontSize:11,fontWeight:800,color:P.soft,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>隐私模式</div>
              <Pill bg={privOpt?.color} border={privOpt?.border}>{privOpt?.emoji} {privOpt?.label}</Pill>
            </div>
          </div>

          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <Btn ghost onClick={onEdit} small>✏️ 重新编辑</Btn>
            <Btn color={P.teal} onClick={()=>setLaunched(true)}>🚀 启动助手系统</Btn>
          </div>
        </>
      ):(
        <div className="pop">
          <div style={{fontSize:64,marginBottom:12}}>✅</div>
          <h2 style={{fontFamily:"Fredoka One,cursive",fontSize:28,color:P.teal,margin:"0 0 8px"}}>
            助手系统已启动！
          </h2>
          <p style={{fontSize:14,color:P.soft,marginBottom:20}}>所有助手已在后台运行，可以开始使用了</p>
          <div style={{background:"#EAFAF3",border:"2px solid #A8EDD0",borderRadius:14,
            padding:"14px 20px",display:"inline-flex",alignItems:"center",gap:10,
            fontSize:13,color:"#1A6A4A",fontWeight:700}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:P.teal,display:"inline-block",boxShadow:`0 0 8px ${P.teal}`}}/>
            Gateway 已连接 · {agents.length} 个助手运行中
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [step,setStep]=useState(1);
  const [picked,setPicked]=useState([]);
  const [souls,setSouls]=useState({});
  const [rules,setRules]=useState([]);
  const [privacy,setPrivacy]=useState("per-channel-peer");

  return(
    <>
      <style>{FONT_STYLE}</style>
      <div style={{minHeight:"100vh",
        background:"radial-gradient(ellipse at 25% 15%,#EBF0FF 0%,#F4F6FF 45%,#FFF5EE 100%)",
        fontFamily:"Nunito,sans-serif",color:P.ink,paddingBottom:60}}>

        {/* Header */}
        <div style={{background:P.white,borderBottom:"3px solid #EBEBF8",
          padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",
          boxShadow:"0 4px 18px #00000008"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:13,
              background:`linear-gradient(135deg,${P.indigo},${P.coral})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:20,boxShadow:`0 4px 12px ${P.indigo}44`}}>🐾</div>
            <div>
              <div style={{fontFamily:"Fredoka One,cursive",fontSize:18,color:P.ink,lineHeight:1.1}}>OpenClaw 助手配置</div>
              <div style={{fontSize:11,color:P.soft,fontWeight:600}}>Multi-Agent Setup Wizard</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,
            background:"#EAFAF3",border:"2px solid #A8EDD0",borderRadius:14,padding:"7px 16px",
            fontSize:13,fontWeight:700,color:"#1A6A4A"}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:P.teal,display:"inline-block",boxShadow:`0 0 6px ${P.teal}`}}/>
            已连接 ✓
          </div>
        </div>

        {/* Main */}
        <div style={{maxWidth:700,margin:"36px auto 0",padding:"0 20px"}}>
          <div style={{background:P.white,borderRadius:22,padding:"20px 28px",marginBottom:24,
            boxShadow:"0 4px 18px #00000010",border:"2px solid #EBEBF8"}}>
            <StepBar current={step}/>
          </div>
          <div style={{background:P.white,borderRadius:28,padding:"34px 36px",
            boxShadow:"0 8px 40px #00000012",border:"2px solid #EBEBF8"}}>
            {step===1&&<Step1 picked={picked} onToggle={l=>setPicked(p=>p.includes(l)?p.filter(x=>x!==l):[...p,l])} onNext={()=>setStep(2)}/>}
            {step===2&&<Step2 picked={picked} souls={souls} onSoulChange={(l,v)=>setSouls(s=>({...s,[l]:v}))} onNext={()=>setStep(3)} onBack={()=>setStep(1)}/>}
            {step===3&&<Step3 picked={picked} rules={rules} onAddRule={r=>setRules(p=>[...p,r])} onRemoveRule={(al,ch)=>setRules(p=>p.filter(r=>!(r.agentLabel===al&&r.channelId===ch)))} onNext={()=>setStep(4)} onBack={()=>setStep(2)}/>}
            {step===4&&<Step4 privacy={privacy} setPrivacy={setPrivacy} onNext={()=>setStep(5)} onBack={()=>setStep(3)}/>}
            {step===5&&<Step5 picked={picked} souls={souls} rules={rules} privacy={privacy} onEdit={()=>setStep(1)}/>}
          </div>
        </div>
      </div>
    </>
  );
}
