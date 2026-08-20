export const builtInTemplates = [
  {
    id: "builtin-lead",
    name: "高级开篇",
    category: "标题模板",
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
    category: "正文模板",
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
    category: "标题模板",
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
    category: "正文模板",
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
    category: "标题模板",
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
    category: "标题模板",
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
    category: "标题模板",
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
    category: "正文模板",
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
    category: "正文模板",
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
    category: "正文模板",
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
    category: "正文模板",
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
    category: "标题模板",
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
    category: "正文模板",
    html: `
      <section style="margin-bottom: 22px;">
        <section style="margin-bottom: 14px; padding-left: 13px; border-left: 5px solid {{primaryColor}};">
          <h2 style="margin: 0; font-size: 20px; color: {{primaryDark}}; font-weight: 700;">四个小模块摆整齐</h2>
        </section>
        <section>
          <section style="margin-bottom: 10px; padding: 13px 12px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
            <p style="margin: 0 0 4px; color: {{primaryColor}}; font-weight: 700;">标题先醒目</p>
            <p style="margin: 0; color: #666666; font-size: 14px;">让读者快速找到入口。</p>
          </section>
          <section style="margin-bottom: 10px; padding: 13px 12px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
            <p style="margin: 0 0 4px; color: {{primaryColor}}; font-weight: 700;">段落要透气</p>
            <p style="margin: 0; color: #666666; font-size: 14px;">留白会让内容更轻松。</p>
          </section>
          <section style="margin-bottom: 10px; padding: 13px 12px; border-radius: 10px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}};">
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
    category: "正文模板",
    html: `
      <section style="padding: 20px 17px; margin-bottom: 22px; border-radius: 14px; background: #fafafa; border: 1px solid #eeeeee;">
        <section style="text-align: center; margin-bottom: 16px;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 13px; font-weight: 600; letter-spacing: 1px;">四步整理法</p>
          <h2 style="margin: 0; font-size: 21px; color: #333333; font-weight: 700;">把清单整理得更好看</h2>
        </section>
        <ol style="margin: 0; padding-left: 22px; color: #555555; line-height: 1.9;">
          <li><strong style="color: {{primaryColor}};">先定主题：</strong>知道这一段要回答什么，文字就不会散。</li>
          <li><strong style="color: {{primaryColor}};">再排顺序：</strong>把最重要的信息放到更容易被看到的位置。</li>
          <li><strong style="color: {{primaryColor}};">补上细节：</strong>细节不必很多，但要刚好帮读者理解。</li>
          <li><strong style="color: {{primaryColor}};">留个结尾：</strong>最后一句收住全段，让阅读更完整。</li>
        </ol>
      </section>
    `,
  },
  {
    id: "system-two-item-cards",
    name: "双项说明卡",
    category: "正文模板",
    html: `
      <section style="margin-bottom: 24px;">
        <section style="margin-bottom: 14px; padding-left: 13px; border-left: 5px solid {{primaryColor}};">
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
    category: "正文模板",
    html: `
      <section style="margin-bottom: 24px;">
        <section style="text-align: center; margin-bottom: 18px;">
          <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 13px; font-weight: 600; letter-spacing: 1px;">三段式节奏</p>
          <h2 style="margin: 0; font-size: 22px; color: #333333; font-weight: 700;">从开场到收束</h2>
        </section>
        <section style="margin-bottom: 14px; padding: 18px 16px; border-radius: 12px; border: 1px solid {{primaryBorder}}; background: #ffffff;">
          <section style="margin-bottom: 10px;"><span style="display: inline-block; padding: 3px 11px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px;">第一步</span><strong style="margin-left: 7px; color: {{primaryDark}}; font-size: 17px;">打开话题</strong></section>
          <p style="margin: 0;">先用一个清楚的问题或场景，把读者带到同一条线上。</p>
        </section>
        <section style="margin-bottom: 14px; padding: 18px 16px; border-radius: 12px; border: 1px solid {{primaryBorder}}; background: #ffffff;">
          <section style="margin-bottom: 10px;"><span style="display: inline-block; padding: 3px 11px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px;">第二步</span><strong style="margin-left: 7px; color: {{primaryDark}}; font-size: 17px;">展开细节</strong></section>
          <p style="margin: 0;">把理由拆成几层，读起来就像顺着台阶往前走。</p>
        </section>
        <section style="padding: 18px 16px; border-radius: 12px; border: 1px solid {{primaryBorder}}; background: #ffffff;">
          <section style="margin-bottom: 10px;"><span style="display: inline-block; padding: 3px 11px; border-radius: 999px; background: {{primaryColor}}; color: #ffffff; font-size: 13px;">第三步</span><strong style="margin-left: 7px; color: {{primaryDark}}; font-size: 17px;">收住重点</strong></section>
          <p style="margin: 0;">最后把话落到一个明确结论上，让内容更有完成感。</p>
        </section>
      </section>
    `,
  },
  {
    id: "system-four-cards",
    name: "四项说明卡",
    category: "正文模板",
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
    category: "正文模板",
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
    category: "引导模板",
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
    category: "正文模板",
    html: `
      <section style="padding: 13px 14px; margin-bottom: 10px; border-radius: 8px; background: #f7f7f7; color: #888888; font-size: 12px; line-height: 1.7;">
        小提示：这块适合放补充说明，也可以提醒自己发布前再检查一遍。
      </section>
    `,
  },
  {
    id: "builtin-title-minimal-line",
    name: "极简横线标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px; text-align: center;">
        <p style="margin: 0 auto 10px; width: 46px; height: 3px; background: {{primaryColor}}; border-radius: 999px;"></p>
        <h2 style="margin: 0; color: #1f2937; font-size: 22px; line-height: 1.45; font-weight: 800;">这一节的小标题</h2>
        <p style="margin: 8px 0 0; color: #8a8f98; font-size: 13px; letter-spacing: 1px;">SECTION TITLE</p>
      </section>
    `,
  },
  {
    id: "builtin-title-centered-badge",
    name: "居中徽章标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 20px; padding: 18px 16px; text-align: center; background: {{primarySoft}}; border-radius: 12px; border: 1px solid {{primaryBorder}};">
        <span style="display: inline-block; margin: 0 0 10px; padding: 4px 13px; color: #ffffff; background: {{primaryColor}}; border-radius: 999px; font-size: 13px; font-weight: 700;">今日重点</span>
        <h2 style="margin: 0; color: {{primaryDark}}; font-size: 23px; line-height: 1.45; font-weight: 800;">先把核心问题讲明白</h2>
        <p style="margin: 9px 0 0; color: #667085; font-size: 14px;">适合文章开篇或重点章节标题</p>
      </section>
    `,
  },
  {
    id: "builtin-title-side-bar",
    name: "左侧竖线标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px; padding: 0 0 0 14px; border-left: 5px solid {{primaryColor}};">
        <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 13px; font-weight: 700; letter-spacing: 1px;">小节标题</p>
        <h2 style="margin: 0; color: #111827; font-size: 22px; line-height: 1.45; font-weight: 800;">用一句话带出下面的内容</h2>
      </section>
    `,
  },
  {
    id: "builtin-title-question",
    name: "提问式标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px; padding: 17px 16px; border-radius: 12px; background: #ffffff; border: 1px solid {{primaryBorder}};">
        <p style="margin: 0 0 9px; color: {{primaryColor}}; font-size: 30px; line-height: 1; font-weight: 800;">?</p>
        <h2 style="margin: 0 0 8px; color: #1f2937; font-size: 22px; line-height: 1.45; font-weight: 800;">为什么这件事值得现在讨论？</h2>
        <p style="margin: 0; color: #667085; font-size: 14px; line-height: 1.8;">用一个问题打开段落，天然适合承接分析和观点。</p>
      </section>
    `,
  },
  {
    id: "builtin-title-numbered",
    name: "编号章节标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px;">
        <span style="display: inline-block; margin: 0 0 9px; padding: 4px 11px; color: #ffffff; background: {{primaryDark}}; border-radius: 6px; font-size: 13px; font-weight: 700;">01</span>
        <h2 style="margin: 0; color: {{primaryDark}}; font-size: 22px; line-height: 1.45; font-weight: 800;">把第一个重点讲透</h2>
        <p style="margin: 9px 0 0; color: #667085; font-size: 14px;">适合连续章节、清单文章和教程内容。</p>
      </section>
    `,
  },
  {
    id: "builtin-title-dark-band",
    name: "深色横幅标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px; padding: 18px 17px; background: {{primaryDark}}; border-radius: 12px;">
        <p style="margin: 0 0 7px; color: {{primaryLight}}; font-size: 13px; font-weight: 700; letter-spacing: 1px;">重点章节</p>
        <h2 style="margin: 0; color: #ffffff; font-size: 23px; line-height: 1.45; font-weight: 800;">这部分请读者停下来看看</h2>
      </section>
    `,
  },
  {
    id: "builtin-title-soft-frame",
    name: "柔和边框标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px; padding: 16px 15px; background: #ffffff; border: 2px solid {{primaryBorder}}; border-radius: 14px; text-align: center;">
        <h2 style="margin: 0; color: {{primaryDark}}; font-size: 22px; line-height: 1.45; font-weight: 800;">让标题更轻一点</h2>
        <p style="margin: 8px 0 0; color: #667085; font-size: 14px;">边框适合温和、说明型的文章风格。</p>
      </section>
    `,
  },
  {
    id: "builtin-title-lab-note",
    name: "笔记标签标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px;">
        <p style="margin: 0 0 8px;"><span style="display: inline-block; padding: 3px 10px; color: {{primaryColor}}; background: {{primarySoft}}; border: 1px solid {{primaryBorder}}; border-radius: 6px; font-size: 13px; font-weight: 700;">NOTE</span></p>
        <h2 style="margin: 0; color: #1f2937; font-size: 22px; line-height: 1.45; font-weight: 800;">像笔记一样把重点标出来</h2>
      </section>
    `,
  },
  {
    id: "builtin-title-double-line",
    name: "上下线标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px; padding: 14px 0; border-top: 1px solid {{primaryBorder}}; border-bottom: 1px solid {{primaryBorder}}; text-align: center;">
        <p style="margin: 0 0 5px; color: {{primaryColor}}; font-size: 13px; font-weight: 700; letter-spacing: 1px;">READING</p>
        <h2 style="margin: 0; color: #111827; font-size: 22px; line-height: 1.45; font-weight: 800;">适合放在文章中段的标题</h2>
      </section>
    `,
  },
  {
    id: "builtin-title-small-label",
    name: "小标签标题",
    category: "标题模板",
    html: `
      <section style="margin: 24px 0 18px;">
        <p style="margin: 0 0 8px; color: #667085; font-size: 14px;"><span style="display: inline-block; width: 8px; height: 8px; margin-right: 7px; background: {{primaryColor}}; border-radius: 999px;"></span>分类标签</p>
        <h2 style="margin: 0; color: #1f2937; font-size: 22px; line-height: 1.45; font-weight: 800;">标题可以简短，也可以很有力</h2>
      </section>
    `,
  },
  {
    id: "builtin-body-intro-card",
    name: "导语正文卡",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 18px 17px; background: {{primarySoft}}; border-radius: 12px; border: 1px solid {{primaryBorder}};">
        <p style="margin: 0 0 10px; color: {{primaryDark}}; font-size: 18px; line-height: 1.7; font-weight: 800;">先用一段导语建立阅读预期</p>
        <p style="margin: 0; color: #4b5563; font-size: 16px; line-height: 1.9;">这一块适合放在标题下面，说明本文会解决什么问题、适合谁阅读，以及读完能带走什么。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-key-points",
    name: "三点重点正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <p style="margin: 0 0 12px; color: {{primaryDark}}; font-size: 18px; font-weight: 800;">这一段可以拆成三个重点：</p>
        <section style="margin: 0 0 10px; padding: 13px 14px; background: #ffffff; border: 1px solid {{primaryBorder}}; border-radius: 10px;"><p style="margin: 0;"><strong style="color: {{primaryColor}};">第一点：</strong>先把背景说清楚，让读者知道问题从哪里来。</p></section>
        <section style="margin: 0 0 10px; padding: 13px 14px; background: #ffffff; border: 1px solid {{primaryBorder}}; border-radius: 10px;"><p style="margin: 0;"><strong style="color: {{primaryColor}};">第二点：</strong>再给出判断，让内容拥有明确方向。</p></section>
        <section style="padding: 13px 14px; background: #ffffff; border: 1px solid {{primaryBorder}}; border-radius: 10px;"><p style="margin: 0;"><strong style="color: {{primaryColor}};">第三点：</strong>最后落到行动，让读者知道下一步怎么做。</p></section>
      </section>
    `,
  },
  {
    id: "builtin-body-number-list",
    name: "数字清单正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 17px 16px; background: #fafafa; border-radius: 12px;">
        <h3 style="margin: 0 0 12px; color: {{primaryDark}}; font-size: 19px; font-weight: 800;">按顺序读会更清楚</h3>
        <ol style="margin: 0; padding-left: 22px; color: #374151; line-height: 1.9;">
          <li>先确认这一段想表达的主要观点。</li>
          <li>再补充一个具体例子，让观点落地。</li>
          <li>最后用一句话收束，避免内容散开。</li>
        </ol>
      </section>
    `,
  },
  {
    id: "builtin-body-quote-block",
    name: "引用观点正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <blockquote style="margin: 0 0 14px; padding: 15px 16px; background: {{primarySoft}}; border-left: 4px solid {{primaryColor}}; color: {{primaryDark}}; font-size: 17px; line-height: 1.9; font-weight: 700;">真正有用的内容，不是把信息堆满，而是把重点放到读者看得见的地方。</blockquote>
        <p style="margin: 0; color: #4b5563; line-height: 1.9;">引用之后可以接一段解释，告诉读者这句话和当前主题之间的关系。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-checklist",
    name: "检查清单正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 17px 16px; border-radius: 12px; border: 1px solid {{primaryBorder}}; background: #ffffff;">
        <p style="margin: 0 0 12px; color: {{primaryDark}}; font-size: 18px; font-weight: 800;">发布前快速检查</p>
        <ul style="margin: 0; padding-left: 22px; line-height: 1.9;">
          <li>标题是否能让人一眼看懂主题</li>
          <li>段落之间是否有足够留白</li>
          <li>重点句是否已经单独突出</li>
          <li>结尾是否给出明确行动</li>
        </ul>
      </section>
    `,
  },
  {
    id: "builtin-body-split-story",
    name: "场景故事正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <section style="margin: 0 0 12px; padding: 15px 15px; background: {{primarySoft}}; border-radius: 12px;">
          <p style="margin: 0 0 7px; color: {{primaryColor}}; font-weight: 800;">场景一</p>
          <p style="margin: 0; line-height: 1.9;">先描述一个读者熟悉的画面，让内容有代入感。</p>
        </section>
        <section style="padding: 15px 15px; background: #ffffff; border: 1px solid {{primaryBorder}}; border-radius: 12px;">
          <p style="margin: 0 0 7px; color: {{primaryColor}}; font-weight: 800;">转折点</p>
          <p style="margin: 0; line-height: 1.9;">再说明这个场景背后的问题，正文就有了继续展开的理由。</p>
        </section>
      </section>
    `,
  },
  {
    id: "builtin-body-faq",
    name: "问答正文块",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <section style="margin: 0 0 12px; padding: 15px; border-radius: 12px; background: {{primarySoft}};">
          <p style="margin: 0 0 7px; color: {{primaryDark}}; font-size: 17px; font-weight: 800;">Q：这个方法适合什么时候用？</p>
          <p style="margin: 0; line-height: 1.9;">A：适合用在需要快速解释、快速总结、快速引导行动的内容里。</p>
        </section>
        <section style="padding: 15px; border-radius: 12px; background: #ffffff; border: 1px solid {{primaryBorder}};">
          <p style="margin: 0 0 7px; color: {{primaryDark}}; font-size: 17px; font-weight: 800;">Q：正文应该写多长？</p>
          <p style="margin: 0; line-height: 1.9;">A：先把一个问题说完整，再决定是否继续展开。</p>
        </section>
      </section>
    `,
  },
  {
    id: "builtin-body-timeline",
    name: "时间线正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding-left: 14px; border-left: 3px solid {{primaryBorder}};">
        <section style="margin: 0 0 14px;"><p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 800;">第一阶段</p><p style="margin: 0; line-height: 1.9;">先收集素材，把想说的话都放到同一个地方。</p></section>
        <section style="margin: 0 0 14px;"><p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 800;">第二阶段</p><p style="margin: 0; line-height: 1.9;">再整理顺序，让读者跟着你的节奏走。</p></section>
        <section><p style="margin: 0 0 5px; color: {{primaryColor}}; font-weight: 800;">第三阶段</p><p style="margin: 0; line-height: 1.9;">最后检查重点、标题和收尾是否互相呼应。</p></section>
      </section>
    `,
  },
  {
    id: "builtin-body-warning-note",
    name: "注意事项正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 16px 15px; background: #fff8f0; border: 1px solid #f3c796; border-radius: 12px;">
        <p style="margin: 0 0 8px; color: #a15c16; font-size: 18px; font-weight: 800;">需要特别注意</p>
        <p style="margin: 0; color: #5f4a37; line-height: 1.9;">这里适合放风险提示、使用限制、活动规则或容易误解的补充说明。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-case-card",
    name: "案例拆解正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 17px 16px; border-radius: 12px; background: #ffffff; border: 1px solid {{primaryBorder}};">
        <p style="margin: 0 0 8px; color: {{primaryColor}}; font-size: 14px; font-weight: 800;">案例拆解</p>
        <h3 style="margin: 0 0 10px; color: #1f2937; font-size: 20px; line-height: 1.5;">一个好案例通常包含三件事</h3>
        <p style="margin: 0 0 8px;">背景：先交代发生了什么。</p>
        <p style="margin: 0 0 8px;">动作：再说明做了什么选择。</p>
        <p style="margin: 0;">结果：最后给出变化和启发。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-data-note",
    name: "数据说明正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 18px 16px; background: {{primaryDark}}; border-radius: 12px; color: #ffffff;">
        <p style="margin: 0 0 7px; color: {{primaryLight}}; font-size: 13px; font-weight: 800; letter-spacing: 1px;">DATA NOTE</p>
        <p style="margin: 0 0 8px; color: #ffffff; font-size: 28px; line-height: 1.2; font-weight: 800;">80%</p>
        <p style="margin: 0; color: #ffffff; line-height: 1.9;">这里可以放一个关键数据，再用一句话解释它为什么重要。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-step-card",
    name: "步骤说明正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <ol style="margin: 0; padding-left: 22px; color: #374151; line-height: 1.9;">
          <li><strong style="color: {{primaryDark}};">先确定主题和读者。</strong></li>
          <li><strong style="color: {{primaryDark}};">整理素材并删掉重复信息。</strong></li>
          <li><strong style="color: {{primaryDark}};">用标题、重点和总结完成排版。</strong></li>
        </ol>
      </section>
    `,
  },
  {
    id: "builtin-body-summary-box",
    name: "段落总结正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 18px 16px; border-radius: 12px; background: {{primarySoft}}; border-left: 5px solid {{primaryColor}};">
        <p style="margin: 0 0 8px; color: {{primaryDark}}; font-size: 18px; font-weight: 800;">这一段可以这样总结</p>
        <p style="margin: 0; color: #4b5563; line-height: 1.9;">先把观点归纳成一句话，再给一个容易记住的小结论，让读者读完之后知道该记住什么。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-comparison",
    name: "对比分析正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <section style="margin: 0 0 12px; padding: 15px; background: #f7f7f7; border-radius: 12px;">
          <p style="margin: 0 0 6px; color: #667085; font-weight: 800;">常见写法</p>
          <p style="margin: 0; color: #4b5563; line-height: 1.9;">信息很多，但读者需要自己找重点。</p>
        </section>
        <section style="padding: 15px; background: {{primarySoft}}; border: 1px solid {{primaryBorder}}; border-radius: 12px;">
          <p style="margin: 0 0 6px; color: {{primaryColor}}; font-weight: 800;">优化写法</p>
          <p style="margin: 0; color: #4b5563; line-height: 1.9;">先放结论，再给理由，最后补充例子。</p>
        </section>
      </section>
    `,
  },
  {
    id: "builtin-body-paragraph-pack",
    name: "标准正文段落",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <p style="margin: 0 0 13px; color: #374151; line-height: 1.95;">第一段负责交代背景，不需要太长，但要让读者知道为什么要继续看。</p>
        <p style="margin: 0 0 13px; color: #374151; line-height: 1.95;">第二段开始进入重点，用更清楚的句子解释你的判断和理由。</p>
        <p style="margin: 0; color: #374151; line-height: 1.95;">第三段可以补一个例子或行动建议，让内容落到具体场景里。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-tip-stack",
    name: "提示堆叠正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <ul style="margin: 0; padding-left: 22px; color: #374151; line-height: 1.9;">
          <li><strong style="color: {{primaryColor}};">提示一：</strong>先写读者最关心的问题。</li>
          <li><strong style="color: {{primaryColor}};">提示二：</strong>每段只讲一个重点。</li>
          <li><strong style="color: {{primaryColor}};">提示三：</strong>结尾给出下一步动作。</li>
        </ul>
      </section>
    `,
  },
  {
    id: "builtin-body-image-caption",
    name: "配图说明正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px;">
        <section style="padding: 30px 16px; text-align: center; background: {{primarySoft}}; border: 1px dashed {{primaryBorder}}; border-radius: 12px;">
          <p style="margin: 0; color: {{primaryColor}}; font-size: 16px; font-weight: 800;">这里替换为文章配图</p>
        </section>
        <p style="margin: 9px 0 0; color: #8a8f98; font-size: 13px; line-height: 1.7; text-align: center;">图片说明可以简短一点，帮助读者理解画面和正文的关系。</p>
      </section>
    `,
  },
  {
    id: "builtin-body-product-note",
    name: "推荐说明正文",
    category: "正文模板",
    html: `
      <section style="margin: 18px 0 22px; padding: 17px 16px; border-radius: 12px; background: #ffffff; border: 1px solid {{primaryBorder}};">
        <p style="margin: 0 0 6px; color: {{primaryColor}}; font-size: 13px; font-weight: 800; letter-spacing: 1px;">推荐理由</p>
        <h3 style="margin: 0 0 10px; color: #1f2937; font-size: 20px; line-height: 1.5;">适合放产品、工具或资源介绍</h3>
        <p style="margin: 0 0 8px;">它解决的问题：把核心痛点写清楚。</p>
        <p style="margin: 0 0 8px;">它适合的人群：告诉读者是否和自己有关。</p>
        <p style="margin: 0;">它的使用建议：给出一个可执行的小动作。</p>
      </section>
    `,
  },
  {
    id: "builtin-guide-follow",
    name: "引导关注卡",
    category: "引导模板",
    html: `
      <section style="margin: 24px 0 18px; padding: 20px 18px; text-align: center; background: {{primarySoft}}; border: 1px solid {{primaryBorder}}; border-radius: 14px;">
        <p style="margin: 0 0 8px; color: {{primaryDark}}; font-size: 21px; line-height: 1.5; font-weight: 800;">喜欢这篇内容的话</p>
        <p style="margin: 0 0 13px; color: #4b5563; line-height: 1.9;">可以点个关注，下一篇更新我们继续把复杂问题讲清楚。</p>
        <span style="display: inline-block; padding: 6px 16px; color: #ffffff; background: {{primaryColor}}; border-radius: 999px; font-size: 14px; font-weight: 800;">关注公众号</span>
      </section>
    `,
  },
  {
    id: "builtin-guide-read-original",
    name: "引导阅读原文",
    category: "引导模板",
    html: `
      <section style="margin: 24px 0 18px; padding: 18px 17px; background: #ffffff; border: 1px solid {{primaryBorder}}; border-radius: 14px;">
        <p style="margin: 0 0 8px; color: {{primaryColor}}; font-size: 14px; font-weight: 800; letter-spacing: 1px;">延伸阅读</p>
        <h3 style="margin: 0 0 10px; color: {{primaryDark}}; font-size: 20px; line-height: 1.5; font-weight: 800;">想看完整资料或相关链接</h3>
        <p style="margin: 0; color: #4b5563; line-height: 1.9;">可以点击文末“阅读原文”，继续查看更完整的内容和补充材料。</p>
      </section>
    `,
  },
];

export const builtInTemplateCategoryOrder = [
  "标题模板",
  "正文模板",
  "引导模板",
];

