const editor = document.querySelector("#editor");
const sourceEditor = document.querySelector("#sourceEditor");
const sourceModeBtn = document.querySelector("#sourceModeBtn");
const copyBtn = document.querySelector("#copyBtn");
const clearBtn = document.querySelector("#clearBtn");
const saveDraftBtn = document.querySelector("#saveDraftBtn");
const loadDraftBtn = document.querySelector("#loadDraftBtn");
const insertLinkBtn = document.querySelector("#insertLinkBtn");
const linkInput = document.querySelector("#linkInput");
const foreColor = document.querySelector("#foreColor");
const colorCodeInput = document.querySelector("#colorCodeInput");
const statusText = document.querySelector("#statusText");
const toast = document.querySelector("#toast");
const draftModal = document.querySelector("#draftModal");
const draftModalCloseBtn = document.querySelector("#draftModalCloseBtn");
const draftList = document.querySelector("#draftList");
const draftEmpty = document.querySelector("#draftEmpty");
const emptyTemplate = document.querySelector("#emptyTemplate");
const templateList = document.querySelector("#templateList");
const templateCount = document.querySelector("#templateCount");
const insertTemplateBtn = document.querySelector("#insertTemplateBtn");
const deleteTemplateBtn = document.querySelector("#deleteTemplateBtn");
const saveTemplateBtn = document.querySelector("#saveTemplateBtn");
const templateNameInput = document.querySelector("#templateNameInput");
const templateHtmlInput = document.querySelector("#templateHtmlInput");

const draftKey = "wechat-editor-draft";
const draftsKey = "wechat-editor-drafts";
const draftMigrationKey = "wechat-editor-drafts-migrated";
const apiBase = "/api";
const defaultTemplateColor = "#d92d20";
const builtInTemplates = [
  {
    id: "builtin-lead",
    name: "高级开篇",
    category: "基础模板",
    html: `
      <section style="margin: 0 0 22px; padding: 20px 22px; background: linear-gradient(135deg, {{primarySoft}}, #ffffff); border: 1px solid {{primaryBorder}}; border-radius: 12px;">
        <p style="margin: 0 0 8px; color: {{primaryColor}}; font-size: 13px; font-weight: 700; letter-spacing: 0.08em;">开场先点亮</p>
        <p style="margin: 0; color: #1f2937; font-size: 16px; line-height: 1.9;">先用一句轻巧的开场，把今天想说的事摆到读者面前。</p>
      </section>
    `,
  },
  {
    id: "builtin-focus",
    name: "重点提示",
    category: "基础模板",
    html: `
      <section style="margin: 20px 0; padding: 18px 20px; background: {{primaryDark}}; border-radius: 12px; color: #ffffff;">
        <p style="margin: 0 0 8px; color: {{primaryLight}}; font-size: 14px; font-weight: 700;">一句话先抓住重点</p>
        <p style="margin: 0; color: #fff7f7; font-size: 16px; line-height: 1.85;">少一点绕路，多一点清楚，让重点像按钮一样一眼可见。</p>
      </section>
    `,
  },
  {
    id: "builtin-section",
    name: "章节标题",
    category: "基础模板",
    html: `
      <section style="margin: 26px 0 16px;">
        <p style="margin: 0 0 8px; width: 42px; height: 4px; background: linear-gradient(90deg, {{primaryColor}}, {{primaryLight}}); border-radius: 999px;"></p>
        <h2 style="margin: 0; color: #111827; font-size: 20px; line-height: 1.45; font-weight: 800;">灵感整理站</h2>
      </section>
    `,
  },
  {
    id: "builtin-summary",
    name: "结尾总结",
    category: "基础模板",
    html: `
      <section style="margin: 28px 0 0; padding: 20px 22px; background: {{primarySoft}}; border-left: 4px solid {{primaryColor}};">
        <p style="margin: 0 0 10px; color: #111827; font-size: 17px; font-weight: 800;">收尾留一点回响</p>
        <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.9;">把前面的内容轻轻收住，再给读者一个可以带走的小结论。</p>
      </section>
    `,
  },
  {
    id: "system-title-cover",
    name: "标题封面",
    category: "标题开篇模板",
    html: `
      <section style="padding: 23px 18px; margin-bottom: 22px; text-align: center; border-radius: 14px; background: linear-gradient(180deg, {{primarySoft}} 0%, #ffffff 100%); border: 1px solid {{primaryBorder}};">
        <span style="display: inline-block; padding: 4px 14px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px; letter-spacing: 1px;">灵感卡片</span>
        <h1 style="margin: 13px 0 7px; color: {{primaryDark}}; font-size: 25px; line-height: 1.45; font-weight: 700;">把复杂想法<br>排成好看的样子</h1>
        <p style="margin: 0; color: #8b6b5e; font-size: 14px;">让文字有秩序，也有一点亮光。</p>
      </section>
    `,
  },
  {
    id: "system-opening-quote",
    name: "开篇引用段",
    category: "标题开篇模板",
    html: `
      <section style="margin-bottom: 23px; padding: 0 3px;">
        <p style="margin: 0 0 12px;">开篇不用太用力，先给读者一把进入内容的钥匙。</p>
        <p style="margin: 0 0 14px; padding: 13px 15px; border-left: 4px solid {{primaryColor}}; background: {{primarySoft}}; color: {{primaryDark}}; font-size: 17px; font-weight: 700;">真正好读的段落，会让人愿意继续往下看。</p>
        <p style="margin: 0;">接下来把重点慢慢展开，节奏就稳了。</p>
      </section>
    `,
  },
  {
    id: "system-conclusion-card",
    name: "核心结论卡",
    category: "标题开篇模板",
    html: `
      <section style="padding: 19px 17px; margin-bottom: 23px; border-radius: 13px; background: {{primaryColor}}; color: #ffffff;">
        <p style="margin: 0 0 6px; text-align: center; color: {{primaryLight}}; font-size: 13px; letter-spacing: 1px;">先抓重点</p>
        <p style="margin: 0 0 10px; text-align: center; color: #ffffff; font-size: 21px; line-height: 1.5; font-weight: 700;">先把结论说清楚<br>再把理由讲好</p>
        <p style="margin: 0; color: #ffffff;">这一块适合放整篇内容的核心判断，让读者快速进入状态。</p>
        <p style="margin: 10px 0 0; color: {{primaryLight}};">补充一句提醒，信息会更完整。</p>
      </section>
    `,
  },
  {
    id: "system-numbered-section",
    name: "编号小节",
    category: "内容结构模板",
    html: `
      <section style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 14px; color: {{primaryDark}}; font-size: 21px; font-weight: 700;">01｜先给段落一个清晰入口</h2>
        <p style="margin: 0 0 11px;">小节标题负责带路，正文负责把话说透。</p>
        <p style="margin: 0;">当段落层级清楚，读者扫一眼也能找到重点。</p>
      </section>
    `,
  },
  {
    id: "system-three-cards",
    name: "三项说明卡",
    category: "内容结构模板",
    html: `
      <section style="margin-bottom: 24px; padding: 19px 16px; border-radius: 14px; background: {{primarySoft}};">
        <h2 style="margin: 0 0 16px; text-align: center; color: {{primaryDark}}; font-size: 21px; font-weight: 700;">把内容拆成三块</h2>
        <section style="padding: 14px; margin-bottom: 11px; border-radius: 10px; background: #ffffff;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 17px; font-weight: 700;">开头负责吸引</p>
          <p style="margin: 0; color: #626262;">用一句轻巧的话，把读者带进主题。</p>
        </section>
        <section style="padding: 14px; margin-bottom: 11px; border-radius: 10px; background: #ffffff;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 17px; font-weight: 700;">中段负责展开</p>
          <p style="margin: 0; color: #626262;">把理由、例子和细节按顺序摆好。</p>
        </section>
        <section style="padding: 14px; border-radius: 10px; background: #ffffff;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 17px; font-weight: 700;">结尾负责收束</p>
          <p style="margin: 0; color: #626262;">最后留下一句清楚、轻盈、有方向的话。</p>
        </section>
      </section>
    `,
  },
  {
    id: "system-dashed-note",
    name: "虚线提示卡",
    category: "内容结构模板",
    html: `
      <section style="margin-bottom: 24px; padding: 18px 16px; border-radius: 12px; border: 1px dashed {{primaryBorder}}; background: #fffdfb;">
        <h2 style="margin: 0 0 10px; color: {{primaryDark}}; font-size: 20px; font-weight: 700;">这段适合放提醒</h2>
        <p style="margin: 0 0 10px;"><strong style="color: {{primaryColor}};">把最容易被忽略的点，单独拎出来。</strong></p>
        <p style="margin: 0 0 10px;">虚线边框会让内容有一点提示感，但不会太抢正文的风头。</p>
        <p style="margin: 0;">适合放注意事项、补充说明或临时备忘。</p>
      </section>
    `,
  },
  {
    id: "system-compare-cards",
    name: "对比说明卡",
    category: "内容结构模板",
    html: `
      <section style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 14px; color: {{primaryDark}}; font-size: 21px; font-weight: 700;">三种表达方式对比</h2>
        <section style="padding: 14px; margin-bottom: 10px; border-radius: 10px; background: #fafafa; border: 1px solid #eeeeee;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 700;">简洁版</p>
          <p style="margin: 0; color: #666666;">直接说重点，适合放在信息密集的段落里。</p>
        </section>
        <section style="padding: 14px; margin-bottom: 10px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 700;">温柔版</p>
          <p style="margin: 0; color: #666666;">语气更松弛，适合承接说明和过渡内容。</p>
        </section>
        <section style="padding: 14px; border-radius: 10px; background: #fafafa; border: 1px solid #eeeeee;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 700;">强调版</p>
          <p style="margin: 0; color: #666666;">把关键句放大一点，让读者停下来多看一眼。</p>
        </section>
      </section>
    `,
  },
  {
    id: "system-guide-cover",
    name: "标题导语卡",
    category: "标题开篇模板",
    html: `
      <section style="padding: 22px 18px; margin-bottom: 20px; border-radius: 14px; background: linear-gradient(180deg, {{primarySoft}} 0%, #ffffff 100%); border: 1px solid {{primaryBorder}};">
        <section style="text-align: center; margin-bottom: 16px;">
          <span style="display: inline-block; padding: 4px 14px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px; letter-spacing: 1px;">排版灵感</span>
          <h1 style="margin: 12px 0 6px; font-size: 24px; line-height: 1.45; color: {{primaryDark}}; font-weight: 700;">一篇文章的<br>舒适阅读节奏</h1>
          <p style="margin: 0; color: #8b6d61; font-size: 14px;">标题、导语、重点，一步一步铺开。</p>
        </section>
        <p style="margin: 0 0 12px;">导语可以像一张小地图，让读者知道接下来会看到什么。</p>
        <p style="margin: 0 0 16px; padding: 13px 15px; border-left: 4px solid {{primaryColor}}; background: #ffffff; color: {{primaryDark}}; font-weight: 600;">先把主线放稳，后面的内容就更容易读下去。</p>
        <p style="margin: 0;">这一块适合放在文章开头，帮正文建立更清楚的节奏。</p>
      </section>
    `,
  },
  {
    id: "system-two-column-cards",
    name: "双列说明卡",
    category: "内容结构模板",
    html: `
      <section style="margin-bottom: 22px;">
        <section style="display: flex; align-items: center; margin-bottom: 14px;">
          <span style="display: inline-block; width: 8px; height: 24px; margin-right: 9px; border-radius: 8px; background: {{primaryColor}};"></span>
          <h2 style="margin: 0; font-size: 20px; color: {{primaryDark}}; font-weight: 700;">四个小模块摆整齐</h2>
        </section>
        <section style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <section style="padding: 13px 12px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
            <p style="margin: 0 0 4px; color: {{primaryColor}}; font-weight: 700;">标题先醒目</p>
            <p style="margin: 0; color: #666666; font-size: 14px;">让读者快速找到入口。</p>
          </section>
          <section style="padding: 13px 12px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
            <p style="margin: 0 0 4px; color: {{primaryColor}}; font-weight: 700;">段落要透气</p>
            <p style="margin: 0; color: #666666; font-size: 14px;">留白会让内容更轻松。</p>
          </section>
          <section style="padding: 13px 12px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
            <p style="margin: 0 0 4px; color: {{primaryColor}}; font-weight: 700;">重点要突出</p>
            <p style="margin: 0; color: #666666; font-size: 14px;">该停顿的地方就停一下。</p>
          </section>
          <section style="padding: 13px 12px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
            <p style="margin: 0 0 4px; color: {{primaryColor}}; font-weight: 700;">结尾要有力</p>
            <p style="margin: 0; color: #666666; font-size: 14px;">最后一句负责收住情绪。</p>
          </section>
        </section>
      </section>
    `,
  },
  {
    id: "system-list-card",
    name: "四项列表卡",
    category: "流程列表模板",
    html: `
      <section style="padding: 20px 17px; margin-bottom: 22px; border-radius: 14px; background: #fafafa; border: 1px solid #eeeeee;">
        <section style="text-align: center; margin-bottom: 16px;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 13px; font-weight: 600; letter-spacing: 1px;">四步整理法</p>
          <h2 style="margin: 0; font-size: 21px; color: #333333; font-weight: 700;">把清单整理得更好看</h2>
        </section>
        <section style="margin-bottom: 10px; padding: 12px 14px; border-radius: 9px; background: #ffffff;"><p style="margin: 0;"><strong style="color: {{primaryColor}};">01 先定主题</strong><br><span style="color: #666666;">知道这一段要回答什么，文字就不会散。</span></p></section>
        <section style="margin-bottom: 10px; padding: 12px 14px; border-radius: 9px; background: #ffffff;"><p style="margin: 0;"><strong style="color: {{primaryColor}};">02 再排顺序</strong><br><span style="color: #666666;">把最重要的信息放到更容易被看到的位置。</span></p></section>
        <section style="margin-bottom: 10px; padding: 12px 14px; border-radius: 9px; background: #ffffff;"><p style="margin: 0;"><strong style="color: {{primaryColor}};">03 补上细节</strong><br><span style="color: #666666;">细节不必很多，但要刚好帮读者理解。</span></p></section>
        <section style="padding: 12px 14px; border-radius: 9px; background: #ffffff;"><p style="margin: 0;"><strong style="color: {{primaryColor}};">04 留个结尾</strong><br><span style="color: #666666;">最后一句收住全段，让阅读更完整。</span></p></section>
      </section>
    `,
  },
  {
    id: "system-two-item-cards",
    name: "双项说明卡",
    category: "内容结构模板",
    html: `
      <section style="margin-bottom: 24px;">
        <section style="display: flex; align-items: center; margin-bottom: 14px;">
          <span style="display: inline-block; width: 8px; height: 24px; margin-right: 9px; border-radius: 8px; background: {{primaryColor}};"></span>
          <h2 style="margin: 0; font-size: 20px; color: {{primaryDark}}; font-weight: 700;">两种思路都可以</h2>
        </section>
        <section style="padding: 15px; margin-bottom: 12px; border-radius: 11px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 700; font-size: 16px;">轻快表达</p>
          <p style="margin: 0; color: #666666;">适合节奏明亮的内容，句子短一点，阅读感更轻。</p>
        </section>
        <section style="padding: 15px; border-radius: 11px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 700; font-size: 16px;">稳重表达</p>
          <p style="margin: 0; color: #666666;">适合需要慢慢说明的内容，层次清楚会更可靠。</p>
        </section>
      </section>
    `,
  },
  {
    id: "system-three-stage",
    name: "三阶段流程",
    category: "流程列表模板",
    html: `
      <section style="margin-bottom: 24px;">
        <section style="text-align: center; margin-bottom: 18px;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 13px; font-weight: 600; letter-spacing: 1px;">三段式节奏</p>
          <h2 style="margin: 0; font-size: 22px; color: #333333; font-weight: 700;">从开场到收束</h2>
        </section>
        <section style="margin-bottom: 14px; padding: 18px 16px; border-radius: 12px; border: 1px solid {{primaryBorder}}; background: #ffffff; box-shadow: 0 5px 16px rgba(80,40,20,0.05);">
          <section style="margin-bottom: 10px;"><span style="display: inline-block; padding: 3px 11px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px;">第一步</span><strong style="margin-left: 7px; color: {{primaryDark}}; font-size: 17px;">打开话题</strong></section>
          <p style="margin: 0;">先用一个清楚的问题或场景，把读者带到同一条线上。</p>
        </section>
        <section style="margin-bottom: 14px; padding: 18px 16px; border-radius: 12px; border: 1px solid {{primaryBorder}}; background: #ffffff; box-shadow: 0 5px 16px rgba(80,40,20,0.05);">
          <section style="margin-bottom: 10px;"><span style="display: inline-block; padding: 3px 11px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px;">第二步</span><strong style="margin-left: 7px; color: {{primaryDark}}; font-size: 17px;">展开细节</strong></section>
          <p style="margin: 0;">把理由拆成几层，读起来就像顺着台阶往前走。</p>
        </section>
        <section style="padding: 18px 16px; border-radius: 12px; border: 1px solid {{primaryBorder}}; background: #ffffff; box-shadow: 0 5px 16px rgba(80,40,20,0.05);">
          <section style="margin-bottom: 10px;"><span style="display: inline-block; padding: 3px 11px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px;">第三步</span><strong style="margin-left: 7px; color: {{primaryDark}}; font-size: 17px;">收住重点</strong></section>
          <p style="margin: 0;">最后把话落到一个明确结论上，让内容更有完成感。</p>
        </section>
      </section>
    `,
  },
  {
    id: "system-four-cards",
    name: "四项说明卡",
    category: "内容结构模板",
    html: `
      <section style="padding: 20px 16px; margin-bottom: 24px; border-radius: 14px; background: {{primarySoft}};">
        <section style="text-align: center; margin-bottom: 18px;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 13px; font-weight: 600; letter-spacing: 1px;">四个排版小心思</p>
          <h2 style="margin: 0; font-size: 22px; color: {{primaryDark}}; font-weight: 700;">让正文更耐看</h2>
        </section>
        <section style="margin-bottom: 12px; padding: 15px; border-radius: 11px; background: #ffffff;"><p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 16px; font-weight: 700;">01 留白</p><p style="margin: 0; color: #666666;">空一点，读者的眼睛才不会累。</p></section>
        <section style="margin-bottom: 12px; padding: 15px; border-radius: 11px; background: #ffffff;"><p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 16px; font-weight: 700;">02 对齐</p><p style="margin: 0; color: #666666;">边界整齐，页面就会显得更安静。</p></section>
        <section style="margin-bottom: 12px; padding: 15px; border-radius: 11px; background: #ffffff;"><p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 16px; font-weight: 700;">03 层级</p><p style="margin: 0; color: #666666;">标题、重点、正文要各自站在自己的位置。</p></section>
        <section style="padding: 15px; border-radius: 11px; background: #ffffff;"><p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 16px; font-weight: 700;">04 节奏</p><p style="margin: 0; color: #666666;">短句和长句交替出现，阅读会更舒服。</p></section>
      </section>
    `,
  },
  {
    id: "system-highlight-card",
    name: "重点信息卡",
    category: "重点强调模板",
    html: `
      <section style="margin-bottom: 24px; padding: 22px 17px; border-radius: 16px; background: linear-gradient(135deg, {{primaryDark}} 0%, {{primaryColor}} 100%); color: #ffffff;">
        <section style="text-align: center; margin-bottom: 17px;">
          <span style="display: inline-block; padding: 4px 13px; border-radius: 999px; background: #ffffff; color: {{primaryDark}}; font-size: 13px; font-weight: 700;">重点收纳</span>
          <h2 style="margin: 12px 0 5px; color: #ffffff; font-size: 23px; line-height: 1.5;">把最想说的话放在这里</h2>
          <p style="margin: 0; color: {{primaryLight}}; font-size: 14px;">颜色深一点，语气也可以更笃定一点。</p>
        </section>
        <section style="padding: 15px 14px; border-radius: 12px; background: rgba(255,255,255,0.13);">
          <p style="margin: 0 0 10px; color: #ffffff; font-size: 16px;">✓ 一句醒目的标题</p>
          <p style="margin: 0 0 10px; color: #ffffff; font-size: 16px;">✓ 一段明亮的说明</p>
          <p style="margin: 0 0 10px; color: #ffffff; font-size: 16px;">✓ 一个清楚的重点</p>
          <p style="margin: 0; color: #ffffff; font-size: 16px;">✓ 一个好用的结尾</p>
        </section>
        <p style="margin: 14px 0 0; text-align: center; color: {{primaryLight}}; font-size: 12px; line-height: 1.7;">适合放在文章中段或结尾前，用来集中强调。</p>
      </section>
    `,
  },
  {
    id: "common-bottom-guide",
    name: "底部引导卡",
    category: "收尾提示模板",
    html: `
      <section style="padding: 21px 17px; margin-bottom: 16px; text-align: center; border-radius: 14px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
        <p style="margin: 0 0 7px; color: {{primaryDark}}; font-size: 20px; font-weight: 700;">愿每一段文字<br>都有清楚的方向</p>
        <p style="margin: 0; color: #666666;">收尾不必用力，只要让读者知道下一步看哪里。</p>
      </section>
    `,
  },
  {
    id: "common-note",
    name: "说明提示",
    category: "收尾提示模板",
    html: `
      <section style="padding: 13px 14px; margin-bottom: 10px; border-radius: 8px; background: #f7f7f7; color: #888888; font-size: 12px; line-height: 1.7;">
        小提示：这块适合放补充说明，也可以提醒自己发布前再检查一遍。
      </section>
    `,
  },
];
let sourceMode = false;
let toastTimer = 0;
let systemFileTemplates = [];
let draftSummaries = [];
let selectedTemplateId = "";
let pendingDeleteTemplateId = "";
let pendingDeleteDraftId = "";
let serverStorageAvailable = false;
let systemTemplateFileHandle = null;
let storageReady = Promise.resolve();
const templateMainColor = defaultTemplateColor;

function showToast(message, statusMessage = message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  statusText.textContent = statusMessage;
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function setDefaultContent() {
  editor.innerHTML = emptyTemplate.innerHTML.trim();
}

function canUseServerStorage() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

function removeLocalKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // localStorage may be blocked in private browsing; ignore cleanup failures.
  }
}

async function apiJson(path, options = {}) {
  if (!canUseServerStorage()) throw new Error("Server storage is unavailable for this page.");

  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(`${apiBase}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(fetchOptions.headers || {}),
      },
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("请求超时，请稍后再试");
    }
    throw new Error("接口请求失败，请检查网站后端是否已部署");
  } finally {
    window.clearTimeout(timeoutId);
  }

  const contentType = response.headers.get("Content-Type") || "";

  if (!response.ok) {
    let message = "";
    if (contentType.includes("application/json")) {
      try {
        const payload = await response.json();
        message = payload.error || "";
      } catch (error) {}
    }
    if (!message && response.status === 404) {
      message = `当前网站没有配置接口：${path}`;
    }
    throw new Error(message || `请求失败：${response.status}`);
  }

  if (response.status === 204) return null;
  if (!contentType.includes("application/json")) {
    throw new Error(`当前网站没有配置接口：${path}`);
  }
  return response.json();
}

function normalizeSystemTemplates(templates) {
  if (!Array.isArray(templates)) return [];

  return templates
    .map((template) => {
      const id = String(template.id || `system-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const name = String(template.name || "").trim();
      const html = sanitizeTemplateHtml(String(template.html || "").trim());
      if (!id || !name || !html) return null;

      return {
        ...template,
        id,
        name,
        category: String(template.category || "导入系统模板").trim().slice(0, 80),
        html,
      };
    })
    .filter(Boolean);
}

async function saveSystemFileTemplates(nextTemplates = systemFileTemplates, options = {}) {
  const { mergeWithExistingFile = true } = options;
  const normalizedTemplates = normalizeSystemTemplates(nextTemplates);

  if (serverStorageAvailable) {
    try {
      const savedTemplates = await apiJson("/system-templates", {
        method: "PUT",
        body: JSON.stringify({ templates: normalizedTemplates }),
      });
      systemFileTemplates = normalizeSystemTemplates(savedTemplates);
      return "file";
    } catch (error) {
      serverStorageAvailable = false;
    }
  }

  return saveSystemTemplatesToLocalFile(normalizedTemplates, { mergeWithExistingFile });
}

function mergeSystemTemplates(fileTemplates, nextTemplates) {
  const merged = [];
  const usedKeys = new Set();

  [...normalizeSystemTemplates(fileTemplates), ...normalizeSystemTemplates(nextTemplates)].forEach((template) => {
    const key = template.id || template.name;
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    merged.push(template);
  });

  return merged;
}

function canWriteLocalTemplateFile() {
  return Boolean(window.showOpenFilePicker);
}

async function pickSystemTemplateFile() {
  if (!canWriteLocalTemplateFile()) {
    throw new Error("当前浏览器不支持直接写入本地文件，请使用 Chrome 或 Edge");
  }

  const [handle] = await window.showOpenFilePicker({
    id: "wechat-editor-system-templates",
    types: [
      {
        description: "系统模板文件",
        accept: { "application/json": [".json"] },
      },
    ],
    excludeAcceptAllOption: false,
  });
  const permission = await handle.requestPermission?.({ mode: "readwrite" });
  if (permission && permission !== "granted") throw new Error("没有获得写入系统模板文件的权限");
  systemTemplateFileHandle = handle;
  return handle;
}

async function readSystemTemplateFile(handle) {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    return normalizeSystemTemplates(JSON.parse(text || "[]"));
  } catch (error) {
    return [];
  }
}

async function saveSystemTemplatesToLocalFile(nextTemplates, options = {}) {
  const { mergeWithExistingFile = true } = options;
  try {
    const handle = systemTemplateFileHandle || (await pickSystemTemplateFile());
    const fileTemplates = await readSystemTemplateFile(handle);
    const templates = mergeWithExistingFile ? mergeSystemTemplates(fileTemplates, nextTemplates) : normalizeSystemTemplates(nextTemplates);
    const writable = await handle.createWritable();
    await writable.write(`${JSON.stringify(templates, null, 2)}\n`);
    await writable.close();
    systemFileTemplates = templates;
    return "local-file";
  } catch (error) {
    if (error.name === "AbortError") return "cancelled";
    return "unavailable";
  }
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function mixColor(hex, targetHex, weight) {
  const color = hexToRgb(hex);
  const target = hexToRgb(targetHex);
  return rgbToHex({
    r: color.r * (1 - weight) + target.r * weight,
    g: color.g * (1 - weight) + target.g * weight,
    b: color.b * (1 - weight) + target.b * weight,
  });
}

function colorTokens() {
  return {
    "{{primaryColor}}": templateMainColor,
    "{{primarySoft}}": mixColor(templateMainColor, "#ffffff", 0.9),
    "{{primaryBorder}}": mixColor(templateMainColor, "#ffffff", 0.64),
    "{{primaryLight}}": mixColor(templateMainColor, "#ffffff", 0.42),
    "{{primaryDark}}": mixColor(templateMainColor, "#111827", 0.32),
  };
}

function renderTemplateHtml(template) {
  return Object.entries(colorTokens()).reduce(
    (html, [token, value]) => html.replaceAll(token, value),
    template.html,
  );
}

function applyTemplateTheme() {
  const tokens = colorTokens();
  document.documentElement.style.setProperty("--template-color", tokens["{{primaryColor}}"]);
  document.documentElement.style.setProperty("--template-soft", tokens["{{primarySoft}}"]);
  document.documentElement.style.setProperty("--template-border", tokens["{{primaryBorder}}"]);
  document.documentElement.style.setProperty("--template-light", tokens["{{primaryLight}}"]);
  document.documentElement.style.setProperty("--template-dark", tokens["{{primaryDark}}"]);
}

function getAllTemplates() {
  return [...builtInTemplates, ...systemFileTemplates];
}

function findTemplate(id) {
  return getAllTemplates().find((template) => template.id === id);
}

function isImportedSystemTemplate(id) {
  return systemFileTemplates.some((template) => template.id === id);
}

function renderTemplateList(selectedId = selectedTemplateId) {
  const nextSelectedTemplateId = findTemplate(selectedId) ? selectedId : "";
  if (nextSelectedTemplateId !== selectedTemplateId) pendingDeleteTemplateId = "";
  selectedTemplateId = nextSelectedTemplateId;
  templateList.innerHTML = "";
  const templateGroups = builtInTemplates.reduce((groups, template) => {
    const category = template.category || "系统模板";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(template);
    return groups;
  }, new Map());
  templateGroups.forEach((templates, title) => {
    renderTemplateGroup(title, templates, "系统");
  });
  if (systemFileTemplates.length) {
    const systemGroups = systemFileTemplates.reduce((groups, template) => {
      const category = template.category || "导入系统模板";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(template);
      return groups;
    }, new Map());
    systemGroups.forEach((templates, title) => {
      renderTemplateGroup(title, templates, "系统");
    });
  }
  templateCount.textContent = `${systemFileTemplates.length} 个系统导入`;
  updateTemplateButtons();
}

function renderTemplateGroup(title, templates, label) {
  const group = document.createElement("section");
  group.className = "template-group";

  const heading = document.createElement("p");
  heading.className = "template-group-title";
  heading.textContent = title;
  group.appendChild(heading);

  templates.forEach((template) => {
    group.appendChild(createTemplateCard(template, label));
  });

  templateList.appendChild(group);
}

function createTemplateCard(template, label) {
  const card = document.createElement("article");
  card.className = `template-item${template.id === selectedTemplateId ? " active" : ""}`;
  card.dataset.templateId = template.id;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");

  const head = document.createElement("div");
  head.className = "template-item-head";

  const title = document.createElement("h3");
  title.textContent = template.name;

  const badge = document.createElement("span");
  badge.textContent = label;

  head.append(title, badge);

  const preview = document.createElement("div");
  preview.className = "template-preview";
  const previewContent = document.createElement("div");
  previewContent.className = "template-preview-content";
  previewContent.innerHTML = renderTemplateHtml(template);
  preview.appendChild(previewContent);

  const foot = document.createElement("div");
  foot.className = "template-item-foot";
  foot.innerHTML = "<span>点击添加到正文</span><span>+</span>";

  card.append(head, preview, foot);
  return card;
}

function updateTemplateButtons() {
  const hasTemplate = Boolean(findTemplate(selectedTemplateId));
  const isConfirmingDelete = Boolean(selectedTemplateId && pendingDeleteTemplateId === selectedTemplateId);
  insertTemplateBtn.disabled = !hasTemplate;
  deleteTemplateBtn.disabled = !isImportedSystemTemplate(selectedTemplateId);
  deleteTemplateBtn.textContent = isConfirmingDelete ? "确认删除" : "删除模板";
  deleteTemplateBtn.classList.toggle("danger", isConfirmingDelete);
}

function getActiveContent() {
  return sourceMode ? sourceEditor.value.trim() : editor.innerHTML.trim();
}

function setActiveContent(html) {
  if (sourceMode) {
    sourceEditor.value = html;
    sourceEditor.focus();
  } else {
    editor.innerHTML = html;
    editor.focus();
  }
}

function addTemplateToContent(template) {
  const html = renderTemplateHtml(template).trim();
  const current = getActiveContent();
  const defaultHtml = emptyTemplate.innerHTML.trim();
  const nextHtml = !current || current === defaultHtml ? html : `${current}\n${html}`;
  setActiveContent(nextHtml);
  showToast(`已添加模板：${template.name}`, "已添加");
}

function addSelectedTemplate() {
  const template = findTemplate(selectedTemplateId);
  if (!template) {
    showToast("请先选择一个模板", "选模板");
    return;
  }
  addTemplateToContent(template);
}

function sanitizeTemplateHtml(rawHtml) {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, link, meta, base").forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return doc.body.innerHTML.trim();
}

async function saveTemplate() {
  const name = templateNameInput.value.trim();
  const html = sanitizeTemplateHtml(templateHtmlInput.value.trim());

  if (!name) {
    showToast("请先输入模板名称", "未保存");
    templateNameInput.focus();
    return;
  }

  if (!html) {
    showToast("请先粘贴 HTML 模板", "未保存");
    templateHtmlInput.focus();
    return;
  }

  const existing = systemFileTemplates.find((template) => template.name === name);
  const now = new Date().toISOString();

  if (existing) {
    const ok = window.confirm("已存在同名模板，是否覆盖？");
    if (!ok) return;

    const nextTemplates = systemFileTemplates.map((template) =>
      template.id === existing.id
        ? {
            ...template,
            html,
            category: template.category || "导入系统模板",
            updatedAt: now,
          }
        : template,
    );
    const savedTo = await saveSystemFileTemplates(nextTemplates);
    if (savedTo === "cancelled") {
      showToast("已取消选择系统模板文件", "未保存");
      return;
    }
    if (savedTo === "unavailable") {
      showToast("模板没有写入文件，请使用 Chrome/Edge 或本地服务", "保存失败");
      return;
    }
    renderTemplateList(existing.id);
    showToast(`系统模板已更新：${name}`, savedTo === "file" ? "网站文件已更新" : "本地文件已更新");
  } else {
    const template = {
      id: `system-import-${Date.now()}`,
      name,
      category: "导入系统模板",
      html,
      createdAt: now,
    };
    const savedTo = await saveSystemFileTemplates([...systemFileTemplates, template]);
    if (savedTo === "cancelled") {
      showToast("已取消选择系统模板文件", "未保存");
      return;
    }
    if (savedTo === "unavailable") {
      showToast("模板没有写入文件，请使用 Chrome/Edge 或本地服务", "保存失败");
      return;
    }
    renderTemplateList(template.id);
    showToast(`系统模板已写入文件：${name}`, savedTo === "file" ? "网站文件已更新" : "本地文件已更新");
  }

  templateNameInput.value = "";
  templateHtmlInput.value = "";
}

async function deleteSelectedTemplate() {
  await ensureStorageReady();

  const template = findTemplate(selectedTemplateId);

  if (!template) {
    showToast("请先选择一个模板", "选模板");
    return;
  }

  if (!isImportedSystemTemplate(selectedTemplateId)) {
    showToast("内置系统模板不能删除", "系统模板");
    return;
  }

  if (pendingDeleteTemplateId !== selectedTemplateId) {
    pendingDeleteTemplateId = selectedTemplateId;
    updateTemplateButtons();
    showToast(`再点一次确认删除模板：${template.name}`, "确认删除");
    return;
  }

  const savedTo = await saveSystemFileTemplates(systemFileTemplates.filter((item) => item.id !== selectedTemplateId), {
    mergeWithExistingFile: false,
  });
  if (savedTo === "cancelled") {
    showToast("已取消选择系统模板文件", "未删除");
    return;
  }
  if (savedTo === "unavailable") {
    showToast("模板没有从文件删除，请使用 Chrome/Edge 或本地服务", "删除失败");
    return;
  }
  pendingDeleteTemplateId = "";
  renderTemplateList("");
  showToast(`模板已删除：${template.name}`, savedTo === "file" ? "网站文件已更新" : "本地文件已更新");
}

function getArticleHtml() {
  return `
    <section style="max-width: 677px; margin: 0 auto; color: #333333; font-size: 16px; line-height: 1.8;">
      ${editor.innerHTML}
    </section>
  `.replace(/\n\s+/g, "\n").trim();
}

function htmlToPlainText(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.innerText.trim();
}

async function copyArticle() {
  if (sourceMode) {
    editor.innerHTML = sourceEditor.value;
  }

  const html = getArticleHtml();
  const text = htmlToPlainText(html);

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await fallbackCopy(html);
    }
    showToast("已复制微信富文本，可粘贴到公众号后台", "已复制");
  } catch (error) {
    await fallbackCopy(html);
    showToast("已复制，若样式缺失请用浏览器授权剪贴板", "已复制");
  }
}

function fallbackCopy(html) {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.contentEditable = "true";
    box.style.position = "fixed";
    box.style.left = "-9999px";
    box.innerHTML = html;
    document.body.appendChild(box);

    const range = document.createRange();
    range.selectNodeContents(box);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    selection.removeAllRanges();
    box.remove();
    resolve();
  });
}

function toggleSourceMode() {
  sourceMode = !sourceMode;
  document.querySelector(".phone-frame").classList.toggle("source-active", sourceMode);
  sourceModeBtn.setAttribute("aria-pressed", String(sourceMode));
  sourceModeBtn.textContent = sourceMode ? "返回编辑" : "编辑源码";

  if (sourceMode) {
    sourceEditor.value = editor.innerHTML.trim();
    sourceEditor.focus();
    showToast("已进入 HTML 源码模式");
  } else {
    editor.innerHTML = sourceEditor.value.trim() || emptyTemplate.innerHTML.trim();
    editor.focus();
    showToast("已返回可视化编辑");
  }
}

function clearContent() {
  const ok = window.confirm("确认清空正文内容吗？");
  if (!ok) return;

  editor.innerHTML = "";
  sourceEditor.value = "";
  if (sourceMode) {
    sourceEditor.focus();
  } else {
    editor.focus();
  }
  showToast("正文已清空");
}

function createStorageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0)} KB`;
}

function getTextBytes(text) {
  return new Blob([text || ""]).size;
}

function createDraftTitle(html) {
  const text = htmlToPlainText(html).replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 28);
  return `未命名草稿 ${formatDateTime(new Date().toISOString())}`;
}

function normalizeDraft(draft) {
  if (!draft || !draft.html) return null;
  const html = String(draft.html);
  const id = String(draft.id || createStorageId("draft")).replace(/[^\w-]/g, "") || createStorageId("draft");
  const savedAt = draft.savedAt || new Date().toISOString();

  return {
    id,
    title: String(draft.title || createDraftTitle(html)).trim().slice(0, 80),
    html,
    savedAt,
  };
}

function summarizeDraft(draft) {
  return {
    id: draft.id,
    title: draft.title,
    savedAt: draft.savedAt,
    bytes: getTextBytes(draft.html),
  };
}

function normalizeDraftSummaries(drafts) {
  if (!Array.isArray(drafts)) return [];

  return drafts
    .filter((draft) => draft && draft.id)
    .map((draft) => ({
      id: String(draft.id),
      title: String(draft.title || "未命名草稿"),
      savedAt: draft.savedAt || "",
      bytes: Number(draft.bytes || 0),
    }))
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

function loadLocalDrafts() {
  const drafts = Array.isArray(readLocalJson(draftsKey, [])) ? readLocalJson(draftsKey, []) : [];
  const normalizedDrafts = drafts.map(normalizeDraft).filter(Boolean);
  const legacyDraft = normalizeDraft(readLocalJson(draftKey, null));

  if (legacyDraft && !normalizedDrafts.some((draft) => draft.html === legacyDraft.html && draft.savedAt === legacyDraft.savedAt)) {
    normalizedDrafts.unshift(legacyDraft);
    writeLocalJson(draftsKey, normalizedDrafts);
  }

  if (legacyDraft) removeLocalKey(draftKey);

  return normalizedDrafts.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

function saveLocalDraft(draft) {
  const normalized = normalizeDraft(draft);
  if (!normalized) return false;
  const drafts = [normalized, ...loadLocalDrafts().filter((item) => item.id !== normalized.id)].slice(0, 80);
  return writeLocalJson(draftsKey, drafts);
}

function getLocalDraft(id) {
  return loadLocalDrafts().find((draft) => draft.id === id) || null;
}

function deleteLocalDraft(id) {
  const drafts = loadLocalDrafts().filter((draft) => draft.id !== id);
  return writeLocalJson(draftsKey, drafts);
}

async function fetchDraftSummaries() {
  if (serverStorageAvailable) {
    try {
      return normalizeDraftSummaries(await apiJson("/drafts"));
    } catch (error) {
      serverStorageAvailable = false;
    }
  }

  return loadLocalDrafts().map(summarizeDraft);
}

async function getStoredDraft(id) {
  if (serverStorageAvailable) {
    try {
      return normalizeDraft(await apiJson(`/drafts/${encodeURIComponent(id)}`));
    } catch (error) {
      return null;
    }
  }

  return getLocalDraft(id);
}

async function deleteStoredDraft(id) {
  if (serverStorageAvailable) {
    await apiJson(`/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
    return "file";
  }

  deleteLocalDraft(id);
  return "browser";
}

async function saveDraft() {
  await ensureStorageReady();

  const html = (sourceMode ? sourceEditor.value : editor.innerHTML).trim();
  if (!html) {
    showToast("正文为空，暂时没有可保存的草稿");
    return;
  }

  const draft = {
    id: createStorageId("draft"),
    title: createDraftTitle(html),
    html,
    savedAt: new Date().toISOString(),
  };

  if (serverStorageAvailable) {
    try {
      const savedDraft = await apiJson("/drafts", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      draftSummaries = normalizeDraftSummaries([savedDraft, ...draftSummaries]);
      showToast("草稿已保存到本地文件", "已保存");
      return;
    } catch (error) {
      serverStorageAvailable = false;
    }
  }

  const saved = saveLocalDraft(draft);
  showToast(saved ? "草稿已保存到浏览器列表" : "草稿保存失败，请检查浏览器存储权限", saved ? "已保存" : "保存失败");
}

function replaceArticleContent(html) {
  const nextHtml = html || emptyTemplate.innerHTML.trim();
  editor.innerHTML = nextHtml;
  sourceEditor.value = nextHtml;

  if (sourceMode) {
    sourceEditor.focus();
  } else {
    editor.focus();
  }
}

function renderDraftList() {
  draftList.innerHTML = "";
  draftEmpty.hidden = draftSummaries.length > 0;

  draftSummaries.forEach((draft) => {
    const isConfirmingDelete = draft.id === pendingDeleteDraftId;
    const item = document.createElement("article");
    item.className = `draft-item${isConfirmingDelete ? " confirming" : ""}`;
    item.dataset.draftId = draft.id;

    const info = document.createElement("div");
    info.className = "draft-item-info";

    const title = document.createElement("h3");
    title.textContent = draft.title || "未命名草稿";

    const meta = document.createElement("p");
    meta.textContent = `${formatDateTime(draft.savedAt)} · ${formatBytes(draft.bytes)}`;

    info.append(title, meta);

    if (isConfirmingDelete) {
      const warning = document.createElement("p");
      warning.className = "draft-confirm-text";
      warning.textContent = "确认后会删除这个草稿文件。";
      info.appendChild(warning);
    }

    const actions = document.createElement("div");
    actions.className = "draft-item-actions";

    if (isConfirmingDelete) {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "button ghost small";
      cancelBtn.type = "button";
      cancelBtn.dataset.draftAction = "cancel-delete";
      cancelBtn.textContent = "取消";

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "button danger small";
      confirmBtn.type = "button";
      confirmBtn.dataset.draftAction = "confirm-delete";
      confirmBtn.textContent = "确认删除";

      actions.append(cancelBtn, confirmBtn);
    } else {
      const restoreBtn = document.createElement("button");
      restoreBtn.className = "button secondary small";
      restoreBtn.type = "button";
      restoreBtn.dataset.draftAction = "restore";
      restoreBtn.textContent = "恢复";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button danger small";
      deleteBtn.type = "button";
      deleteBtn.dataset.draftAction = "delete";
      deleteBtn.textContent = "删除";

      actions.append(restoreBtn, deleteBtn);
    }
    item.append(info, actions);
    draftList.appendChild(item);
  });
}

async function refreshDraftSummaries(showLoading = true) {
  if (showLoading) {
    draftList.innerHTML = '<p class="draft-loading">正在读取草稿...</p>';
    draftEmpty.hidden = true;
  }

  draftSummaries = await fetchDraftSummaries();
  renderDraftList();
}

async function openDraftModal() {
  await ensureStorageReady();
  pendingDeleteDraftId = "";
  draftModal.hidden = false;
  draftModal.classList.add("open");
  document.body.classList.add("modal-open");
  draftModalCloseBtn.focus();
  await refreshDraftSummaries();
}

function closeDraftModal() {
  pendingDeleteDraftId = "";
  draftModal.classList.remove("open");
  draftModal.hidden = true;
  document.body.classList.remove("modal-open");
  loadDraftBtn.focus();
}

async function restoreDraft(id) {
  const draft = await getStoredDraft(id);
  if (!draft) {
    showToast("这个草稿没有读取成功，可能已经被删除");
    await refreshDraftSummaries(false);
    return;
  }

  replaceArticleContent(draft.html);
  closeDraftModal();
  showToast(`草稿已恢复：${draft.title}`, "已恢复");
}

function requestDraftDelete(id) {
  pendingDeleteDraftId = id;
  renderDraftList();
}

function cancelDraftDelete() {
  pendingDeleteDraftId = "";
  renderDraftList();
}

async function removeDraft(id) {
  const draft = draftSummaries.find((item) => item.id === id);
  const title = draft?.title || "未命名草稿";

  try {
    const deletedFrom = await deleteStoredDraft(id);
    pendingDeleteDraftId = "";
    await refreshDraftSummaries(false);
    showToast(`草稿已删除：${title}`, deletedFrom === "file" ? "文件已删除" : "已删除");
  } catch (error) {
    showToast("草稿文件删除失败，请稍后再试", "删除失败");
  }
}

async function syncLocalDraftsToServer() {
  if (readLocalJson(draftMigrationKey, false)) return;

  const localDrafts = loadLocalDrafts();
  if (!localDrafts.length) {
    writeLocalJson(draftMigrationKey, true);
    return;
  }

  const serverDrafts = normalizeDraftSummaries(await apiJson("/drafts"));
  const serverIds = new Set(serverDrafts.map((draft) => draft.id));

  for (const draft of localDrafts) {
    if (serverIds.has(draft.id)) continue;
    await apiJson("/drafts", {
      method: "POST",
      body: JSON.stringify(draft),
    });
  }

  writeLocalJson(draftMigrationKey, true);
}

async function initializePersistentStorage() {
  if (!canUseServerStorage()) return;

  try {
    systemFileTemplates = normalizeSystemTemplates(await apiJson("/system-templates"));
    serverStorageAvailable = true;

    await syncLocalDraftsToServer();
    renderTemplateList(selectedTemplateId);
  } catch (error) {
    serverStorageAvailable = false;
  }
}

async function ensureStorageReady() {
  try {
    await storageReady;
  } catch (error) {
    serverStorageAvailable = false;
  }
}

function insertLink() {
  const url = linkInput.value.trim();
  if (!url) {
    showToast("请先输入链接地址");
    return;
  }
  if (sourceMode) {
    showToast("请先返回可视化编辑再插入链接");
    return;
  }
  editor.focus();
  document.execCommand("createLink", false, url);
  linkInput.value = "";
  showToast("链接已添加到选中文字");
}

document.querySelectorAll(".toolbar button[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    if (sourceMode) toggleSourceMode();
    editor.focus();
    document.execCommand(button.dataset.command, false, null);
  });
});

function normalizeHexInput(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : "";
}

function applyTextColor(color) {
  if (sourceMode) toggleSourceMode();
  editor.focus();
  document.execCommand("foreColor", false, color);
}

function syncColorCode() {
  colorCodeInput.value = foreColor.value.toLowerCase();
  colorCodeInput.classList.remove("invalid");
}

foreColor.addEventListener("input", () => {
  syncColorCode();
  applyTextColor(foreColor.value);
});

colorCodeInput.addEventListener("input", () => {
  const color = normalizeHexInput(colorCodeInput.value);
  colorCodeInput.classList.toggle("invalid", Boolean(colorCodeInput.value.trim()) && !color);
  if (color) foreColor.value = color;
});

colorCodeInput.addEventListener("change", () => {
  const color = normalizeHexInput(colorCodeInput.value);
  if (!color) {
    syncColorCode();
    showToast("请输入 # 号开头的六位颜色编码", "颜色未更新");
    return;
  }

  colorCodeInput.value = color;
  foreColor.value = color;
  colorCodeInput.classList.remove("invalid");
  applyTextColor(color);
});

colorCodeInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  colorCodeInput.dispatchEvent(new Event("change"));
});

colorCodeInput.addEventListener("focus", () => {
  colorCodeInput.select();
});

colorCodeInput.addEventListener("click", () => {
  colorCodeInput.select();
});

syncColorCode();

templateList.addEventListener("click", (event) => {
  const card = event.target.closest(".template-item");
  if (!card) return;
  selectedTemplateId = card.dataset.templateId;
  renderTemplateList(selectedTemplateId);
  addSelectedTemplate();
});

templateList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".template-item");
  if (!card) return;
  event.preventDefault();
  selectedTemplateId = card.dataset.templateId;
  renderTemplateList(selectedTemplateId);
  addSelectedTemplate();
});

insertTemplateBtn.addEventListener("click", addSelectedTemplate);
saveTemplateBtn.addEventListener("click", saveTemplate);
deleteTemplateBtn.addEventListener("click", deleteSelectedTemplate);
copyBtn.addEventListener("click", copyArticle);
clearBtn.addEventListener("click", clearContent);
sourceModeBtn.addEventListener("click", toggleSourceMode);
saveDraftBtn.addEventListener("click", saveDraft);
loadDraftBtn.addEventListener("click", openDraftModal);
insertLinkBtn.addEventListener("click", insertLink);
draftModalCloseBtn.addEventListener("click", closeDraftModal);
draftModal.addEventListener("click", (event) => {
  if (event.target === draftModal) closeDraftModal();
});
draftList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-draft-action]");
  const item = event.target.closest(".draft-item");
  if (!button || !item) return;

  if (button.dataset.draftAction === "restore") {
    await restoreDraft(item.dataset.draftId);
  }

  if (button.dataset.draftAction === "delete") {
    requestDraftDelete(item.dataset.draftId);
  }

  if (button.dataset.draftAction === "cancel-delete") {
    cancelDraftDelete();
  }

  if (button.dataset.draftAction === "confirm-delete") {
    await removeDraft(item.dataset.draftId);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !draftModal.hidden) closeDraftModal();
});

applyTemplateTheme();
renderTemplateList();
setDefaultContent();
storageReady = initializePersistentStorage();
