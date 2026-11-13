'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.helpFa = OD.helpFa || {};

  // ---------------------------------------------------------------- shared text

  const ASK_REFRESH = 'دکمه Ask AI درباره همین صفحه با استفاده از اطلاعات زنده کلاستر از دستیار هوشمند سؤال می‌پرسد. دکمه Refresh کلاستر را دوباره می‌خواند.';

  function toolbarPart(namespaced) {
    const items = [
      { name: 'Context (کانتکست)', description: 'Context یک اتصال ذخیره‌شده به یک کلاستر در فایل kubeconfig است (مثلاً "minikube" یا "prod-eu"). با انتخاب Context دیگر، کل بخش Kubernetes به همان کلاستر تغییر می‌کند. OpsDeck انتخاب شما را خودش به خاطر می‌سپارد و هرگز فایل ~/.kube/config را ویرایش نمی‌کند.' },
    ];
    if (namespaced) {
      items.push({ name: 'Namespace (فضای نام)', description: 'Namespace مثل یک پوشه نام‌دار داخل کلاستر است که اشیاء را گروه‌بندی می‌کند (مثلاً "default"، "shop"، "monitoring"). این فهرست مشخص می‌کند کدام یک نمایش داده شود. وقتی گزینه "All namespaces" روشن است، این فهرست خاکستری می‌شود.' });
      items.push({ name: 'Current namespace / All namespaces button', description: 'بین یک namespace انتخاب‌شده و همه namespaceها یک‌جا جابه‌جا می‌شود. وقتی روشن باشد، به آدرس صفحه "?all=1" اضافه می‌شود و جدول اشیاء کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن namespace هر ردیف به دکمه‌های آخر ردیف یا پنل کناری نگاه کنید).' });
    } else {
      items.push({ name: 'cluster-scoped badge', description: 'به‌جای انتخاب namespace نمایش داده می‌شود. این نوع شیء متعلق به کل کلاستر است، نه یک namespace مشخص، بنابراین چیزی برای فیلتر کردن وجود ندارد.' });
    }
    items.push({ name: 'Connection badge', description: 'نشان سبز "connected" یعنی کلاستر پاسخ داده است. نشان کهربایی "not connected" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا ورود شما منقضی شده است).' });
    items.push({ name: 'Copy context', description: 'یک دستور آماده kubectl را که Context انتخاب‌شده را هدف می‌گیرد کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان paste کنید.' });
    return { name: 'Toolbar (نوار ابزار)', description: 'زیر عنوان صفحه قرار دارد و مشخص می‌کند صفحه از کدام کلاستر' + (namespaced ? ' و namespace' : '') + ' داده بخواند. در بالا سمت راست صفحه دکمه‌های Ask AI و Refresh هم هست. ' + ASK_REFRESH, items };
  }

  function listCardPart(title, scopeText) {
    return {
      name: title + ' card',
      description: 'کارت اصلی صفحه. زیرعنوان آن تعداد اشیای دریافت‌شده را نشان می‌دهد (مثلاً "12 objects") ' + scopeText + ' اگر بیش از ۵۰۰ شیء وجود داشته باشد عبارت "showing first 500 of N" نمایش داده می‌شود و بقیه فهرست نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌خاطر نبود دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh را پیشنهاد می‌کند. اگر چیزی پیدا نشود یک حالت خالی مثل "No ' + title.toLowerCase() + '" می‌بینید.',
    };
  }

  function rowActionsPart(extra) {
    const items = [
      { name: 'Click a row', description: 'پنل جزئیات کناری آن شیء را باز می‌کند (به "Details side panel" نگاه کنید).' },
      { name: 'Ask AI (sparkles icon)', description: 'یک سؤال هوش مصنوعی درباره همین یک شیء باز می‌کند و اطلاعات زنده پاکسازی‌شده را به آن پیوست می‌کند.' },
      { name: 'Copy name (copy icon)', description: 'نام شیء را در کلیپ‌بورد کپی می‌کند تا در یک دستور paste کنید.' },
      { name: 'Details (info icon)', description: 'همان کلیک روی ردیف است: پنل کناری را باز می‌کند.' },
    ];
    if (extra) for (const it of extra) items.push(it);
    return { name: 'Actions column', description: 'دکمه‌های آیکونی کوچک در انتهای هر ردیف.', items };
  }

  function podRowExtras() {
    return [
      { name: 'Logs (file icon)', description: 'پنل کناری‌ای با ۳۰۰ خط آخر لاگ Pod باز می‌کند. در پایین آن دکمه‌های Fullscreen، Open shell، Previous instance (لاگ کانتینر پیش از آخرین ری‌استارت را نشان می‌دهد؛ دوباره بزنید تا برگردید) و Copy logs هست.' },
      { name: 'Shell (terminal icon)', description: 'یک ترمینال تعاملی واقعی داخل Pod باز می‌کند (kubectl exec -it ... -- sh). دستورها را مثل این بنویسید که وارد همان کانتینر شده‌اید. بستن پنل، جلسه را تمام می‌کند.' },
    ];
  }

  function sidePanelPart(actionsText, isPod) {
    const tabs = [
      { name: 'Summary tab', description: 'اطلاعات کلیدی شیء در بخش‌های دارای عنوان (وضعیت، replicas، پورت‌ها، conditions و ...)، و بعد از آن Labels و Annotations به شکل تگ‌های key=value. Labelها تگ‌هایی برای انتخاب اشیاء هستند؛ annotationها یادداشت‌های آزاد هستند که ابزارها اضافه می‌کنند.' },
      { name: 'Events tab', description: 'رویدادهای اخیر کلاستر درباره این شیء، از جدیدترین (Type, Reason, Object, Namespace, Count, Message, Last seen). روی تب یک عدد نمایش داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد.' },
    ];
    if (isPod) tabs.push({ name: 'Logs tab', description: 'با باز کردن این تب، ۳۰۰ خط آخر لاگ Pod بارگذاری می‌شود.' });
    tabs.push({ name: 'Commands tab', description: 'دستورهای آماده kubectl برای همین شیء، هر کدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در یک پنل کناری دیگر نشان می‌دهد. دستورهایی که برچسب "writes" یا "danger" دارند پیش از اجرا تأیید می‌خواهند.' });
    tabs.push({ name: 'Manifest tab', description: 'کل شیء به شکل JSON (همان داده‌ای که Kubernetes ذخیره می‌کند). اطلاعات حسابداری شلوغ مثل last-applied-configuration حذف شده است. این JSON است، نه YAML.' });
    tabs.push({ name: 'Describe tab', description: 'خروجی kubectl describe: گزارشی خوانا که conditions و رویدادهای اخیر را هم دارد. اگر اجرا نشود، پیام "Describe output unavailable" را می‌بینید.' });
    return {
      name: 'Details side panel',
      description: 'با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا و دکمه‌ها پایین پنل هستند. ' + actionsText,
      items: tabs,
    };
  }

  const READ_ONLY_FOOTER = 'این نوع شیء در OpsDeck فقط‌خواندنی است: در پایین پنل پیام "This object is read-only in OpsDeck" و دکمه Ask AI نمایش داده می‌شود، پس نمی‌توانید آن را از اینجا تغییر دهید یا حذف کنید.';
  const DELETE_ONLY_FOOTER = 'در پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد "Delete <name>?" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes اشیای وابسته به آن را هم حذف کند) و دکمه Ask AI.';

  function commandsPart(desc) {
    return {
      name: 'Ready-made kubectl commands',
      description: 'کارتی جمع‌شونده زیر جدول که بر اساس context و namespace انتخاب‌شده ساخته می‌شود. ' + desc + ' هر مورد یک دکمه کپی دارد و اگر اجرای آن داخل OpsDeck امن باشد، یک دکمه play که آن را اجرا و خروجی را نشان می‌دهد. موردهای دارای برچسب "copy only" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های "write" و "danger" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck اول از شما تأیید می‌گیرد.',
    };
  }

  const COMMON_HOW = [
    'داده‌ها با اجرای دستورهای واقعی kubectl از طریق OpsDeck و مستقیم از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودش به‌روز نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا context، namespace یا محدوده را عوض کنید).',
    'اگر kubectl نصب نباشد بنر "kubectl is not installed" را با لینک نصب و کارت Local tools می‌بینید؛ اگر هیچ context در kubeconfig نباشد، "No kubeconfig context found" را با دکمه Import kubeconfig می‌بینید.',
  ];

  const AGE_COL = { name: 'Age', meaning: 'مدت زمانی که از ساخته شدن شیء گذشته است.', example: '3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش.' };
  const NAME_COL = (what) => ({ name: 'Name', meaning: what });

  function listPage(c) {
    const how = [c.how].concat(COMMON_HOW);
    const parts = [toolbarPart(c.namespaced), listCardPart(c.title, c.namespaced ? '(در namespace انتخاب‌شده، یا کل کلاستر با "All namespaces").' : '(این فهرست کل کلاستر است).'), rowActionsPart(c.rowExtras), sidePanelPart(c.footerText, c.isPod), commandsPart(c.cmdText)];
    return {
      title: c.faTitle,
      summary: c.summary,
      whenToUse: c.whenToUse,
      howItWorks: how,
      parts,
      tables: [{ name: c.title + ' table', description: c.tableDesc || 'هر ردیف یک شیء است. سلول‌هایی که قرص رنگی دارند مقدار وضعیت هستند.', columns: c.columns }],
      example: c.example,
      tips: c.tips,
    };
  }

  const data = {};

  // ------------------------------------------------------------------ overview
  data['kubernetes/overview'] = {
    title: 'Cluster overview (نمای کلی کلاستر)',
    summary: 'یک بررسی سلامت تک‌صفحه‌ای از کلاستر Kubernetes انتخاب‌شده: چند node و pod سالم هستند، چه namespaceهایی وجود دارند، تازه‌ترین هشدارها و ابزارهای محلی که OpsDeck از آن‌ها استفاده می‌کند.',
    whenToUse: [
      'تازه به یک کلاستر وصل شده‌اید و می‌خواهید مطمئن شوید زنده است.',
      'حس می‌کنید مشکلی هست و پیش از رفتن سراغ Pods یا Events سریع‌ترین تصویر کلی را می‌خواهید.',
      'باید کلاستر را عوض کنید، یک kubeconfig وارد کنید، یا یک کلاستر محلی Minikube را روشن یا خاموش کنید.',
    ],
    howItWorks: [
      'Kubernetes سیستمی است که کانتینرها (برنامه‌های کوچک بسته‌بندی‌شده) را روی گروهی از ماشین‌ها اجرا می‌کند. کلاستر همان کل گروه است و از طریق یک context در فایل kubeconfig به آن دسترسی پیدا می‌کنید. OpsDeck با اجرای برنامه واقعی kubectl و با context انتخابی شما با کلاستر صحبت می‌کند، پس هر عدد اینجا زنده از کلاستر خوانده شده است.',
      'صفحه هنگام باز شدن یک بار بارگذاری می‌شود. برای خواندن دوباره از Refresh بالا سمت راست استفاده کنید. اگر context انتخاب‌شده پاسخ ندهد، صفحه باز هم تنظیمات محلی شما را نشان می‌دهد و کارت Cluster علت را توضیح می‌دهد.',
      'هر کارت به صفحه‌ای دیگر لینک دارد: "All nodes" و "All namespaces" فهرست کامل را باز می‌کنند.',
    ].concat(COMMON_HOW),
    parts: [
      { name: 'Page header', description: 'زیرعنوان context فعال و نسخه سرور کلاستر را (پس از اتصال) نشان می‌دهد. دکمه‌ها: Import kubeconfig (فایل kubeconfig انتخابی شما را در فضای ذخیره OpsDeck کپی می‌کند)، Ask AI و Refresh.' },
      toolbarPart(true),
      {
        name: 'Summary tiles',
        description: 'چهار عدد بزرگ در بالای صفحه.',
        items: [
          { name: 'Namespaces', description: 'تعداد namespaceها و اینکه چندتای آن‌ها برای شما قابل مشاهده است.' },
          { name: 'Nodes ready', description: 'تعداد nodeهای آماده از کل nodeها، مثلاً 3/3. وقتی همه آماده باشند سبز و در غیر این صورت کهربایی است. زیرنوشته "schedulable capacity" را نشان می‌دهد.' },
          { name: 'Pods running', description: 'تعداد podهای در حال اجرا، با تعداد کل و pending در زیر آن (مثلاً "42 total, 1 pending").' },
          { name: 'Services', description: 'تعداد serviceها، و در زیر آن تعداد deploymentها.' },
        ],
      },
      { name: 'Nodes card', description: 'فهرست فشرده حداکثر ۸ node (ماشین‌هایی که podهای شما را اجرا می‌کنند): نام و IP داخلی، وضعیت Ready یا دلیل خرابی، roles، نسخه Kubernetes، CPU، حافظه، ظرفیت pod و سن. نقطه سبز یا قرمز آمادگی را نشان می‌دهد. "All nodes" صفحه کامل Nodes را باز می‌کند. اگر nodeها خوانده نشوند بنر "Nodes unavailable" نمایش داده می‌شود.' },
      { name: 'Cluster card', description: 'در حالت اتصال: Context، Cluster، Server address، Server version (با پلتفرم) و Namespace انتخاب‌شده. در حالت عدم اتصال، پیام "The cluster did not answer" یا "No context selected" را با دلیل و دکمه Retry نشان می‌دهد.' },
      { name: 'Namespaces card', description: 'حداکثر ۱۰ namespace با Status (Active سبز، هر چیز دیگر کهربایی)، تعداد podهای هر کدام و زمان ساخته شدن. "All namespaces" فهرست کامل را باز می‌کند.' },
      { name: 'Warning events card', description: 'تازه‌ترین رویدادهای Warning از همه namespaceها: دلیل، شیء، namespace، تعداد تکرار، چند وقت پیش و پیام. حالت خالی: "No warning events".' },
      commandsPart('نمونه‌ها: اطلاعات کلاستر، nodeها، همه podها، رویدادهای هشدار، منابع API و context فعلی.'),
      { name: 'Local tools card', description: 'kubectl (علامت‌خورده به‌عنوان الزامی)، kind، minikube و Helm را با نشان سبز نسخه یا نشان قرمز "not installed" نشان می‌دهد. "Install missing tools" نسخه‌های رسمی را در فضای ذخیره خود OpsDeck دانلود می‌کند (بدون sudo و بدون تغییر در کل سیستم) و برای هر ابزار یک نوار پیشرفت نشان می‌دهد.' },
      { name: 'Minikube card', description: 'Minikube ابزاری است که یک کلاستر Kubernetes کوچک روی کامپیوتر خودتان می‌سازد. این کارت نام profile و یک نشان (running، stopped، no profile، not installed) را نشان می‌دهد. Start Minikube یا Stop Minikube اول تأیید می‌گیرد و بعد فقط "minikube start" یا "minikube stop" را اجرا می‌کند.' },
    ],
    tables: [
      { name: 'Nodes card table', columns: [
        { name: 'Node', meaning: 'نام node و زیر آن آدرس IP داخلی‌اش.', example: 'worker-1 with 10.0.0.12' },
        { name: 'Status', meaning: 'Ready (سبز) یا دلیلی که node آماده نیست (قرمز).', example: 'Ready; or KubeletNotReady' },
        { name: 'Roles', meaning: 'کار node. nodeهای control plane مغز کلاستر را اجرا می‌کنند؛ بقیه برنامه‌های شما را.', example: 'control-plane' },
        { name: 'Version', meaning: 'نسخه Kubernetes (kubelet) روی آن node.', example: 'v1.30.2' },
        { name: 'CPU', meaning: 'تعداد هسته CPU در دسترس podها.', example: '4' },
        { name: 'Memory', meaning: 'حافظه در دسترس podها.', example: '8039420Ki' },
        { name: 'Pods', meaning: 'بیشترین تعداد pod که node می‌تواند نگه دارد.', example: '110' },
        AGE_COL,
      ] },
      { name: 'Namespaces card table', columns: [
        { name: 'Namespace', meaning: 'نام namespace.', example: 'kube-system' },
        { name: 'Status', meaning: 'Active یعنی قابل استفاده؛ Terminating یعنی در حال حذف شدن است.', example: 'Active' },
        { name: 'Pods', meaning: 'اکنون چند pod در آن وجود دارد.', example: '7' },
        { name: 'Created', meaning: 'چه مدت پیش ساخته شده است.', example: '12d' },
      ] },
    ],
    example: {
      title: 'مثال: مطمئن شوید یک کلاستر محلی تازه سالم است',
      steps: [
        'Cluster overview را باز کنید و در نوار ابزار context خود را انتخاب کنید (مثلاً minikube).',
        'کارت Cluster را ببینید: باید آدرس و نسخه سرور را نشان دهد و نشان نوار ابزار باید "connected" باشد.',
        '"Nodes ready" را نگاه کنید: 1/1 سبز یعنی node سالم است. کهربایی یعنی یک node آماده نیست، پس Nodes را باز کنید.',
        '"Pods running" و کارت Warning events را ببینید. هشدارهایی مثل FailedScheduling یا BackOff به podی اشاره می‌کنند که نیاز به توجه دارد: Pods یا Events را باز کنید.',
      ],
    },
    tips: [
      'عوض کردن context فقط چیزی را که OpsDeck می‌خواند تغییر می‌دهد؛ هرگز kubeconfig شما را بازنویسی نمی‌کند.',
      'متوقف کردن Minikube بارهای کاری آن را متوقف می‌کند اما فایل‌های کلاستر را روی دیسک نگه می‌دارد.',
      'چند pod در حالت Pending برای مدت کوتاه درست بعد از deploy عادی است؛ تعداد زیاد برای مدت طولانی عادی نیست.',
    ],
  };

  // ------------------------------------------------------------------ insights
  data['kubernetes/insights'] = {
    title: 'Intelligence (هوشمندی)',
    summary: 'تحلیل خودکار و فقط‌خواندنی کلاستر انتخاب‌شده: سلامت، امنیت، ذخیره‌سازی، شبکه، درخواست منابع، هزینه، GitOps و عیب‌یابی که به فهرستی از یافته‌ها تبدیل می‌شود.',
    whenToUse: [
      'می‌خواهید بدون خواندن تک‌تک صفحه‌های منابع بفهمید چه چیزی خراب یا پرخطر است.',
      'کلاستر را برای تقویت امنیت، منابع هدررفته یا نبود تنظیمات پیش‌فرض ذخیره‌سازی بررسی می‌کنید.',
      'می‌خواهید چند کلاستر را کنار هم مقایسه کنید.',
    ],
    howItWorks: [
      'OpsDeck کلاستر را با فراخوانی‌های فقط‌خواندنی kubectl می‌خواند و قانون‌های داخلی را اعمال می‌کند. مقدارهایی که قابل اندازه‌گیری نبوده‌اند به‌صورت unknown یا در کارت Limitations گزارش می‌شوند، هرگز به‌عنوان سالم نشان داده نمی‌شوند.',
      'این تحلیل یک عکس لحظه‌ای است. حدود ۲۰ ثانیه کش می‌شود، تا وقتی صفحه باز است هر ۹۰ ثانیه خودکار تازه می‌شود، و با زدن Refresh یا تغییر محدوده دوباره انجام می‌شود. خط پایین صفحه "Analysed N minutes ago" نشان می‌دهد داده چقدر تازه است.',
      'هیچ چیز در این صفحه کلاستر را تغییر نمی‌دهد. لینک‌های "Open" روی یافته‌ها به صفحه ماژول مربوط می‌روند.',
    ],
    parts: [
      { name: 'Page header', description: 'عنوان "Kubernetes intelligence". دکمه‌ها: "Cross-module view" (فضای کاری Intelligence بین‌ماژولی را باز می‌کند) و Refresh.' },
      { name: 'Cluster scope card', description: 'Context، Namespace، Nodes ready (مثلاً 3 / 3)، Pods running (مثلاً 40 / 42) و نشان GitOps را نشان می‌دهد (سبز با نام ابزارها، یا "Not detected"). فهرست کشویی گوشه آن بین "All namespaces" و "Current namespace" انتخاب می‌کند و تحلیل را دوباره اجرا می‌کند.' },
      {
        name: 'Stat tiles',
        description: 'شش عدد سریع؛ سبز یعنی خوب، نارنجی یا قرمز یعنی دقیق‌تر نگاه کنید.',
        items: [
          { name: 'Pods with problems', description: 'podهایی که سالم نیستند، با مجموع تعداد ری‌استارت‌ها در زیر آن.' },
          { name: 'Unavailable deployments', description: 'deploymentهایی که همه replicaهای مورد نظرشان در دسترس نیست، از کل deploymentها.' },
          { name: 'Security issues', description: 'تعداد podهایی که یک قانون امنیتی را نقض کرده‌اند، با تعداد podهای privileged و bindingهای cluster-admin.' },
          { name: 'Warning events', description: 'رویدادهای Warning که کلاستر نگه داشته، با تعداد podهای آماده‌نشده.' },
          { name: 'Storage claims', description: 'تعداد persistent volume claimها، حجم کل تأمین‌شده و storage class پیش‌فرض (یا "no default class").' },
          { name: 'Monthly cost', description: 'هزینه ماهانه تخمینی درخواست‌های CPU و حافظه، یا "Not priced" تا وقتی قیمت‌ها را در تنظیمات Intelligence وارد نکنید.' },
        ],
      },
      { name: 'Findings card', description: 'فهرست اصلی. هر ردیف یک نشان شدت دارد (Critical قرمز، Warning نارنجی، Info فیروزه‌ای، Pass سبز، Unknown خاکستری)، یک عنوان، متن جزئیات و شواهد، منبع مربوطه و لینک "Open". تعداد هر شدت به‌صورت چیپ در گوشه کارت است. حالت خالی: "No cluster findings".' },
      { name: 'Nodes card', description: 'جدول nodeها با State (Ready یا Not ready)، roles، CPU، حافظه و یک پیام جزئیات. اگر خالی بود، ممکن است RBAC (دسترسی‌ها) اجازه فهرست کردن nodeها را ندهد.' },
      { name: 'Pod security card', description: 'podهایی که مشکل امنیتی دارند، به‌صورت نشان‌های قرصی: کانتینرهای privileged، host namespaceها، volumeهای hostPath، capabilityهای اضافه، توکن‌های mount خودکار. حالت خالی: "No pod security issues".' },
      { name: 'Storage card', description: 'persistent volume claimها با phase، storage class، حجم درخواستی و ظرفیت واقعی.' },
      { name: 'Network card', description: 'serviceها با نوع، cluster IP، نشان Endpoints (Ready، یا "No endpoints" نارنجی یعنی فعلاً هیچ podی پشت service نیست) و پورت‌ها.' },
      { name: 'Troubleshooting card', description: 'رویدادهای Warning گروه‌بندی‌شده بر اساس شیء (تعداد، قرص‌های دلیل، آخرین پیام). اگر podی سه بار یا بیشتر ری‌استارت شده باشد، جدول دوم "Pods with three or more restarts" شامل pod، تعداد ری‌استارت و دلیل انتظار نمایش داده می‌شود.' },
      { name: 'Requests by namespace card', description: 'برای هر namespace: کانتینرهای در حال اجرا، مجموع هسته‌های CPU درخواستی و حافظه درخواستی. برای دیدن اینکه چه کسی بیشترین منابع را رزرو کرده مفید است.' },
      { name: 'Cost allocation card', description: 'برای هر namespace: podها، هسته‌های CPU، حافظه به GB و هزینه ماهانه، یا "not priced". زیرعنوان قیمت‌های تنظیم‌شده را نشان می‌دهد.' },
      { name: 'GitOps card', description: 'Argo CD و Flux را شناسایی می‌کند و workloadهایی را که مدیریت می‌کنند فهرست می‌کند. هشدار می‌دهد که ویرایش مستقیم اشیای مدیریت‌شده با kubectl ممکن است توسط کنترلر برگردانده شود. حالت خالی: "No GitOps controller detected".' },
      { name: 'Multi-cluster comparison card', description: 'Compare را بزنید تا هر context پیکربندی‌شده جداگانه خوانده شود (فقط‌خواندنی). سپس جدولی هر context را نشان می‌دهد: Reachable یا Unreachable، Nodes ready، Pods running، Pods with problems، Deployments available، Warning events و یافته‌های مقایسه. Refresh دوباره می‌خواند. contextهای غیرقابل‌دسترس هم فهرست می‌شوند، پنهان نمی‌شوند.' },
      { name: 'Limitations card', description: 'فهرست ساده چیزهایی که بررسی نشده‌اند (مثلاً نبود metrics-server یا نبود دسترسی).' },
    ],
    tables: [
      { name: 'Findings list', columns: [
        { name: 'Severity', meaning: 'یافته چقدر فوری است.', example: 'Critical = fix now; Info = good to know' },
        { name: 'Title and detail', meaning: 'قانون چه چیزی پیدا کرده و شواهد آن.', example: 'Privileged container: pod shop/api runs container "web" as privileged' },
      ] },
      { name: 'Multi-cluster table', columns: [
        { name: 'Context', meaning: 'نام context؛ مورد فعال با "selected" مشخص شده و کلاستر آن زیرش است.', example: 'prod-eu' },
        { name: 'State', meaning: 'Reachable (سبز) یا Unreachable (قرمز).', example: 'Reachable' },
        { name: 'Nodes ready', meaning: 'nodeهای آماده / کل nodeها.', example: '3 / 3' },
        { name: 'Pods running', meaning: 'podهای در حال اجرا / کل podها.', example: '40 / 42' },
        { name: 'Pods with problems', meaning: 'podهایی که خراب یا گیر کرده‌اند.', example: '2' },
        { name: 'Deployments available', meaning: 'deploymentهای کاملاً در دسترس / کل deploymentها.', example: '9 / 10' },
        { name: 'Warning events', meaning: 'تعداد رویدادهای Warning نگه‌داشته‌شده.', example: '14' },
      ] },
    ],
    example: {
      title: 'مثال: بفهمید چرا کلاستر ناسالم به نظر می‌رسد',
      steps: [
        'Intelligence را باز کنید و stat tileها را ببینید: "Pods with problems 3" قرمز یعنی سه pod سالم نیستند.',
        'کارت Findings را از بالا بخوانید؛ موردهای Critical اول می‌آیند. روی "Open" یکی از آن‌ها بزنید تا به صفحه ماژول بروید.',
        'به Troubleshooting بروید. podی با ۱۲ ری‌استارت و دلیل انتظار CrashLoopBackOff مدام کرش می‌کند؛ Pods را باز کنید و لاگ آن را ببینید.',
        'اگر فهرست شلوغ بود محدوده را به "Current namespace" تغییر دهید و بعد Refresh را بزنید.',
      ],
    },
    tips: [
      'Unknown با سالم یکی نیست: پیش از اعتماد به یک صفحه سبز، کارت Limitations را بخوانید.',
      'هزینه ماهانه فقط یک تخمین از درخواست‌های CPU و حافظه است و باید قیمت‌ها تنظیم شده باشند.',
      'یافته‌ها قاعده‌های سرانگشتی هستند، نه مدرک؛ پیش از تغییر هر چیز در شیء واقعی بررسی کنید.',
    ],
  };

  // ------------------------------------------------------------------ topology
  data['kubernetes/topology'] = {
    title: 'Cluster map (نقشه کلاستر)',
    summary: 'تصویری زنده از مسیر عبور ترافیک در کلاستر: Ingress به Service به Workload به Pod، گروه‌بندی‌شده بر اساس namespace، همراه با سلامت nodeها، هشدارها و فهرستی از بقیه منابع.',
    whenToUse: [
      'می‌خواهید بفهمید یک برنامه چطور به هم وصل شده است.',
      'باید ببینید کدام podها روی کدام node اجرا می‌شوند یا کدام workloadها ناسالم هستند.',
      'دنبال مسیری هستید که یک درخواست وب برای ورود به کلاستر طی می‌کند.',
    ],
    howItWorks: [
      'OpsDeck podها، workloadها، serviceها، ingressها، nodeها و رویدادها را از همه namespaceها می‌خواند و آن‌ها را به‌صورت نوارهای افقی، یکی برای هر namespace، می‌کشد. خط‌ها رابطه‌ها را نشان می‌دهند: "route" (یک ingress ترافیک را به یک service می‌فرستد)، "selects" (یک service با label، podها را انتخاب می‌کند) و "owns" (یک workload این podها را ساخته است).',
      'هر نوار را از چپ به راست بخوانید: Ingresses (نقطه‌های ورود از بیرون)، Services (آدرس‌های داخلی ثابت)، Workloads (Deployments، StatefulSets و DaemonSets که podها را در حال اجرا نگه می‌دارند) و Pods (کانتینرهای در حال اجرا).',
      'مقدارهای Secret و ConfigMap هرگز در نقشه بارگذاری نمی‌شوند. صفحه هنگام باز شدن یک بار می‌خواند؛ برای ترسیم دوباره Refresh را بزنید. اگر کلاستر پاسخ ندهد نقشه خالی است.',
    ].concat(COMMON_HOW),
    parts: [
      toolbarPart(false),
      { name: 'Summary tiles', description: 'Namespaces (و تعداد آن‌ها در نقشه)، Nodes ready (مثلاً 3/3 با "all schedulable" یا "N unhealthy")، Pods (سالم / کل، با تعداد pending، failed و completed) و Workloads (کل، با تعداد deployment، stateful و daemon).' },
      { name: 'Node health rail', description: 'کارتی که هر node را به‌صورت یک دکمه با نشان Ready فهرست می‌کند. با نگه داشتن ماوس روی یک node، podهایی که روی آن اجرا می‌شوند برجسته می‌شوند؛ با کلیک، node در پنل کناری باز می‌شود. یک نشان "N/M ready" را نشان می‌دهد.' },
      {
        name: 'Map card',
        description: 'نقشه بزرگ به‌همراه کنترل‌هایش.',
        items: [
          { name: 'Health badge', description: '"All healthy" (سبز) یا "N issues" (کهربایی/قرمز) را برای اجزای قابل مشاهده نشان می‌دهد.' },
          { name: 'Filter box', description: 'برای فیلتر بر اساس نام، host، image، node، وضعیت، نوع، class یا owner تایپ کنید. نام namespaceها هم تطبیق داده می‌شود.' },
          { name: 'Namespace picker', description: 'نقشه را به یک namespace یا "All namespaces" محدود می‌کند.' },
          { name: 'Problems button', description: 'فقط podها و workloadهای ناسالم را نشان می‌دهد. اگر هیچ‌کدام نباشد "No problems detected" را با دکمه Clear filters می‌بینید.' },
          { name: 'Legend', description: 'سه نوع خط را توضیح می‌دهد: route، selects، owns.' },
          { name: 'Zoom out, Zoom in, Fit to view, Expand map', description: 'دکمه‌های بزرگ‌نمایی و دکمه‌ای که کل گراف را در کادر جا می‌دهد؛ Expand map آن را بزرگ‌تر می‌کند و Esc دوباره کوچکش می‌کند. همچنین می‌توانید برای جابه‌جایی بکشید و برای زوم اسکرول کنید.' },
          { name: 'Namespace band', description: 'برچسب سمت چپ namespace، "N wl, M pods"، یک پرچم سلامت (healthy، degraded یا "N warn") و "N in, M svc" را نشان می‌دهد. روی آن کلیک کنید تا پنل خلاصه namespace باز شود. namespaceهای خالی به‌صورت "no runnable components" و به‌صورت قرص زیر نقشه نمایش داده می‌شوند.' },
          { name: 'Component cards', description: 'هر ingress، service و workload یک کارت با آیکون، نام، یک خط توضیح کوتاه (مثلاً "3/3 ready, nginx:1.25") و یک نشان (وضعیت، تعداد route یا پورت اصلی) است. podها چیپ‌های کوچک‌تری با وضعیت و node هستند. رنگ سلامت را نشان می‌دهد. با نگه داشتن ماوس، اجزای متصل برجسته می‌شوند.' },
          { name: 'Empty states', description: '"No runnable components" (چیزی در کلاستر نیست)، "No matching components" (فیلترها خیلی سخت‌گیرانه‌اند) یا "No problems detected".' },
        ],
      },
      {
        name: 'Component side panel',
        description: 'روی هر کارت، node یا برچسب namespace کلیک کنید. یک نشان وضعیت، اطلاعات کلیدی (برای pod: Status، Node، Ready، Restarts، Owner، Containers، Images؛ برای workloadها: Replicas، Available، Selector، Images؛ برای service: Type، Cluster IP، Ports، Selector؛ برای ingress: Class، Hosts، TLS، Backends؛ برای node: Roles، Internal IP، Kubelet، OS، Allocatable، Scheduled pods)، قرص‌های "Graph links" که با کلیک روی آن‌ها به اجزای متصل می‌روید، و فهرستی از حداکثر ۱۲ pod مرتبط با آیکون‌های Logs، Shell و Details نشان می‌دهد.',
        items: [
          { name: 'Logs and Shell (pods only)', description: 'دکمه‌های پایین پنل که نمایشگر لاگ pod یا یک ترمینال تعاملی داخل آن pod را باز می‌کنند.' },
          { name: 'Details & commands', description: 'پنل کامل جزئیات را باز می‌کند (Summary، Events، Commands، Manifest، Describe، و در صورت مجاز بودن Delete، Scale یا Restart).' },
          { name: 'Ask AI', description: 'درباره شیء انتخاب‌شده از دستیار سؤال بپرسید.' },
        ],
      },
      { name: 'Resources outside the flow', description: 'ردیفی از شمارنده‌ها برای اشیایی که بخشی از مسیر درخواست نیستند (مثلاً ConfigMaps، Secrets، PersistentVolumeClaims، Jobs، CronJobs). هر کاشی به فهرست آن منبع لینک دارد؛ موارد خالی کم‌رنگ هستند.' },
      { name: 'Warnings card', description: 'حداکثر ۶ رویداد هشدار اخیر با دلیل، شیء، namespace، پیام، تعداد تکرار و سن. یک نشان کل تعداد یا "clear" را نشان می‌دهد. کلیک روی یک مورد، در صورت امکان، پنل جزئیات آن شیء را باز می‌کند.' },
      commandsPart('نمونه‌ها: داده‌های نقشه کلاستر، nodeها، serviceها، ingressها و رویدادهای هشدار.'),
    ],
    tables: [
      { name: 'Pod chip fields', description: 'جدول نیست؛ هر چیپ کوچک pod چه چیزی را نشان می‌دهد.', columns: [
        { name: 'Name', meaning: 'نام pod.', example: 'shop-api-7c9d8-abcde' },
        { name: 'Status', meaning: 'وضعیت pod و در خط دوم node.', example: 'Running, worker-2' },
      ] },
      { name: 'Service card fields', columns: [
        { name: 'Meta line', meaning: 'نوع service و cluster IP.', example: 'ClusterIP, 10.96.14.2' },
        { name: 'Badge', meaning: 'اولین پورت، یا "headless" برای serviceهای بدون cluster IP.', example: '8080' },
      ] },
      { name: 'Workload card fields', columns: [
        { name: 'Meta line', meaning: 'replicaهای آماده از تعداد مورد نظر، به‌علاوه اولین image.', example: '2/3 ready, api:1.4' },
        { name: 'Badge', meaning: 'وضعیت workload مثل Available، Progressing یا Unavailable.', example: 'Progressing' },
      ] },
    ],
    example: {
      title: 'مثال: ردیابی اینکه چرا یک وب‌سایت از دسترس خارج شده',
      steps: [
        'Cluster map را باز کنید و نام برنامه (مثلاً "shop") را در کادر فیلتر تایپ کنید.',
        'نوار را از چپ به راست دنبال کنید: ingress به نام "shop.example.com" با یک خط route به service به نام "shop-web"، و بعد به deployment به نام "shop-web" که "0/2 ready" را نشان می‌دهد.',
        'روی کارت deployment کلیک کنید تا podهایش را ببینید. podهایی که CrashLoopBackOff نشان می‌دهند علت هستند.',
        'در پنل کناری روی آیکون Logs یک pod بزنید تا دلیل کرش کردن را بخوانید.',
      ],
    },
    tips: [
      'دکمه Problems را بزنید تا هر چیز سالم پنهان شود.',
      'serviceای که به هیچ pod خطی ندارد معمولاً یعنی selector آن با labelهای هیچ podی نمی‌خواند.',
      'نقشه همه namespaceها را نشان می‌دهد؛ انتخاب‌گر namespace در اینجا فقط تصویر را فیلتر می‌کند.',
    ],
  };

  // ------------------------------------------------------------------ contexts
  data['kubernetes/contexts'] = {
    title: 'Contexts (کانتکست‌ها)',
    summary: 'مدیریت اینکه OpsDeck به کدام کلاسترها وصل شود: همه منبع‌های kubeconfig و contextهای آن‌ها را ببینید، context فعال را عوض کنید، یک فایل kubeconfig وارد کنید، یا نسخه واردشده را حذف کنید.',
    whenToUse: [
      'می‌خواهید به یک کلاستر جدید وصل شوید (کلاستر ابری مدیریت‌شده، kind یا Minikube).',
      'باید بین کلاسترهای staging و production جابه‌جا شوید.',
      'می‌خواهید kubeconfigی را که قبلاً وارد کرده‌اید حذف کنید.',
    ],
    howItWorks: [
      'kubeconfig فایلی است که جزئیات اتصال به یک یا چند کلاستر را دارد. در آن هر context یک آدرس کلاستر، یک کاربر و یک namespace پیش‌فرض را کنار هم قرار می‌دهد. OpsDeck فایل‌های نام‌برده در متغیر KUBECONFIG و ~/.kube/config را می‌خواند.',
      'Import kubeconfig به شما اجازه می‌دهد فایلی انتخاب کنید؛ OpsDeck آن را در فضای ذخیره خودش کپی می‌کند و هنگام اجرای kubectl آن را به‌کار می‌برد. OpsDeck هرگز ~/.kube/config را ویرایش نمی‌کند و هرگز "kubectl config use-context" را اجرا نمی‌کند.',
      'صفحه هنگام باز شدن بارگذاری می‌شود؛ برای خواندن دوباره از Refresh استفاده کنید.',
    ],
    parts: [
      { name: 'Page header', description: 'دکمه‌ها: Import kubeconfig (انتخاب فایل؛ پیام "Kubeconfig imported" یا "already imported" را نشان می‌دهد)، Ask AI و Refresh.' },
      {
        name: 'Source cards',
        description: 'برای هر منبع kubeconfig یک کارت، در هر ردیف دو کارت. زیرعنوان می‌گوید "Imported copy in OpsDeck storage" یا "Installed by the user or KUBECONFIG".',
        items: [
          { name: 'Context row', description: 'نام context با نشان سبز "active" برای مورد در حال استفاده، و زیر آن نام کلاستر، namespace پیش‌فرض و آدرس سرور (مثلاً "minikube, default, https://192.168.49.2:8443").' },
          { name: 'Use button', description: 'روی contextهایی که فعال نیستند دیده می‌شود. آن context را برای کل فضای کاری فعال می‌کند.' },
          { name: 'Remove copy (imported sources only)', description: 'دکمه قرمزی که تأیید می‌گیرد و سپس فقط کپی OpsDeck را حذف می‌کند. فایل اصلی روی دیسک دست‌نخورده می‌ماند.' },
          { name: 'No readable contexts', description: 'حالت خالی وقتی فایل هیچ context معتبری ندارد، همراه با خطا اگر خطایی پیدا شده باشد.' },
        ],
      },
      { name: 'No kubeconfig sources', description: 'حالت خالی با دکمه Import kubeconfig، وقتی چیزی پیدا نشده باشد. kind و Minikube پیکربندی خود را خودکار در ~/.kube/config می‌نویسند.' },
      commandsPart('نمونه‌ها: فهرست contextها، context فعلی، نمایی خلاصه از پیکربندی برای context و namespaceهای انتخاب‌شده.'),
      { name: 'Local tools card', description: 'وضعیت نصب kubectl (الزامی)، kind، minikube و Helm و دکمه "Install missing tools" را نشان می‌دهد.' },
    ],
    example: {
      title: 'مثال: اتصال به یک کلاستر ابری',
      steps: [
        'فایل kubeconfig را از سرویس‌دهنده ابری خود دانلود کنید.',
        'Import kubeconfig را بزنید و فایل را انتخاب کنید.',
        'یک کارت منبع جدید با contextهایش ظاهر می‌شود. کنار مورد دلخواه Use را بزنید.',
        'Cluster overview را باز کنید و ببینید نشان نوار ابزار "connected" باشد.',
      ],
    },
    tips: [
      'حذف یک نسخه واردشده فایل kubeconfig اصلی شما را پاک نمی‌کند.',
      'اگر kubectl نصب نباشد اول یک بنر می‌بینید: از "Install missing tools" استفاده کنید یا خودتان kubectl را نصب کنید.',
    ],
  };

  // ------------------------------------------------------------------ cluster-level lists
  data['kubernetes/namespaces'] = listPage({
    title: 'Namespaces',
    faTitle: 'Namespaces (فضاهای نام)',
    namespaced: false,
    summary: 'همه namespaceهای کلاستر را فهرست می‌کند. namespace یک بخش نام‌دار است که اشیای مرتبط را گروه‌بندی می‌کند، مثلاً یکی برای هر تیم یا هر محیط.',
    whenToUse: ['می‌خواهید ببینید چه namespaceهایی وجود دارند و آیا یکی در حالت Terminating گیر کرده است.', 'دارید انتخاب می‌کنید کدام namespace را بررسی کنید.'],
    how: 'هر ردیف یک namespace است. namespaceها نام‌ها را و، با quota و policy، منابع را از هم جدا می‌کنند، پس دو تیم هر دو می‌توانند podی به نام "api" داشته باشند. کلیک روی یک ردیف labelها، annotationها، رویدادها و manifest را نشان می‌دهد.',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'نمونه‌ها: namespaceها با جزئیات، podهای یک namespace، quotaها و limit rangeها، و describe namespace.',
    columns: [
      NAME_COL('نام namespace.'),
      { name: 'Status', meaning: 'Active (سبز) یعنی قابل استفاده؛ Terminating (کهربایی) یعنی حذف در جریان است و اغلب روی چیزی که قابل حذف نیست گیر کرده.', example: 'Active' },
      AGE_COL,
    ],
    example: { title: 'مثال: پیدا کردن namespaceی که در حذف شدن گیر کرده', steps: ['Namespaces را باز کنید و دنبال وضعیت کهربایی Terminating بگردید.', 'روی ردیف کلیک کنید و برای سرنخ، تب Events و تب Manifest را باز کنید.', 'از تب Commands یک دستور کپی کنید تا ببینید چه چیزی داخل آن باقی مانده است.'] },
    tips: ['namespaceها اینجا فقط‌خواندنی هستند؛ از این صفحه نمی‌توان چیزی ساخت یا حذف کرد.', 'namespaceهای سیستمی مثل kube-system اجزای خود کلاستر را نگه می‌دارند: به آن‌ها دست نزنید.'],
  });

  data['kubernetes/nodes'] = listPage({
    title: 'Nodes',
    faTitle: 'Nodes (نودها)',
    namespaced: false,
    summary: 'ماشین‌هایی (فیزیکی یا مجازی) را که کلاستر را می‌سازند و podهای شما را اجرا می‌کنند، همراه با آمادگی و ظرفیت فهرست می‌کند.',
    whenToUse: ['یک pod در Pending گیر کرده و گمان می‌کنید جا نیست.', 'یک node وضعیت NotReady دارد و جزئیات می‌خواهید.', 'می‌خواهید نسخه Kubernetes هر node را بررسی کنید.'],
    how: 'node یک ماشین در کلاستر است. nodeهای control-plane مغز کلاستر را اجرا می‌کنند؛ nodeهای worker برنامه‌های شما را. CPU، Memory و Pods نشان می‌دهند node چه چیزی را می‌تواند در اختیار podها بگذارد (allocatable)، نه آنچه در حال استفاده است. روی یک ردیف کلیک کنید تا conditions، آدرس‌ها، ظرفیت، منابع allocatable و taintها (قاعده‌هایی که podها را دور می‌کنند) را ببینید.',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'نمونه‌ها: nodeها (wide)، describe node، podهای روی این node و metrics مربوط به node (به metrics-server نیاز دارد).',
    columns: [
      NAME_COL('نام node.'),
      { name: 'Status', meaning: 'Ready (سبز) یا دلیل آماده نبودن (قرمز).', example: 'Ready; or NotReady' },
      { name: 'Roles', meaning: 'labelهای نقش. وقتی node نقش خاصی ندارد "worker" نشان داده می‌شود.', example: 'control-plane' },
      { name: 'Version', meaning: 'نسخه Kubelet (عامل node).', example: 'v1.30.2' },
      { name: 'CPU', meaning: 'هسته‌های CPU قابل تخصیص (allocatable).', example: '4' },
      { name: 'Memory', meaning: 'حافظه قابل تخصیص (allocatable).', example: '8039420Ki' },
      { name: 'Pods', meaning: 'بیشترین تعداد pod که این node می‌تواند نگه دارد.', example: '110' },
      AGE_COL,
    ],
    example: { title: 'مثال: بررسی یک node با وضعیت NotReady', steps: ['Nodes را باز کنید و وضعیت قرمز را پیدا کنید.', 'روی ردیف کلیک کنید و بخش Conditions را در تب Summary بخوانید (مثلاً MemoryPressure یا DiskPressure).', 'تب Events را برای پیام‌های kubelet باز کنید، و بعد با دستور "Pods on node" ببینید چه چیزهایی تحت تأثیر هستند.'] },
    tips: ['nodeها اینجا فقط‌خواندنی هستند: OpsDeck هیچ nodeای را cordon، drain یا حذف نمی‌کند.', 'Allocatable یک عدد ظرفیت است؛ مصرف واقعی به metrics-server و دستور "Node metrics" نیاز دارد.'],
  });

  // ------------------------------------------------------------------ workloads
  data['kubernetes/pods'] = listPage({
    title: 'Pods',
    faTitle: 'Pods (پادها)',
    namespaced: true,
    isPod: true,
    summary: 'podها را فهرست می‌کند؛ کوچک‌ترین واحد اجرایی در Kubernetes: یک یا چند کانتینر که با هم روی یک node اجرا می‌شوند. اینجا جایی است که لاگ می‌خوانید، shell باز می‌کنید و برنامه‌های کرش‌کننده را پیدا می‌کنید.',
    whenToUse: ['یک برنامه خراب است و می‌خواهید لاگ آن را ببینید.', 'یک pod مدام ری‌استارت می‌شود یا در Pending گیر کرده است.', 'داخل یک کانتینر در حال اجرا ترمینال لازم دارید.'],
    how: 'هر ردیف یک pod است. podها معمولاً توسط Deployment، StatefulSet، DaemonSet یا Job ساخته و جایگزین می‌شوند، برای همین نام‌هایشان پسوند تصادفی دارد. Status از phase مربوط به pod می‌آید، یا "Terminating" در زمان حذف شدن. Restarts تعداد ری‌استارت‌های کانتینر را می‌شمارد و وقتی بیشتر از صفر باشد کهربایی می‌شود.',
    rowExtras: podRowExtras(),
    footerText: 'در پایین پنل Open shell، یک دکمه قرمز Delete (تأیید می‌گیرد و بعد pod را حذف می‌کند؛ معمولاً یک کنترلر جایگزینی می‌سازد) و Ask AI هست. تب Logs ۳۰۰ خط آخر را بارگذاری می‌کند.',
    cmdText: 'نمونه‌ها: podها (wide)، podهای غیرفعال، describe، logs، لاگ‌های قبلی، metrics (به metrics-server نیاز دارد) و دستورهای فقط‌کپی follow-logs و shell.',
    columns: [
      NAME_COL('نام pod.'),
      { name: 'Ready', meaning: 'تعداد کانتینرهایی که بررسی آمادگی را پاس کرده‌اند از کل کانتینرهای pod.', example: '1/2 یعنی یکی از دو کانتینر آماده است، پس pod هنوز ترافیک نمی‌گیرد' },
      { name: 'Restarts', meaning: 'مجموع ری‌استارت‌های کانتینر. بالای صفر کهربایی است.', example: '14 نشان یک crash loop است' },
      { name: 'Node', meaning: 'ماشینی که pod روی آن اجرا می‌شود؛ اگر هنوز زمان‌بندی نشده خالی است.', example: 'worker-2' },
      { name: 'IP', meaning: 'آدرس IP داخلی pod در کلاستر.', example: '10.244.1.17' },
      { name: 'Status', meaning: 'وضعیت pod. Running سبز، Pending کهربایی، Failed قرمز، Succeeded فیروزه‌ای، Terminating کهربایی؛ دلیل‌های انتظار مثل CrashLoopBackOff وقتی Kubernetes گزارش کند نمایش داده می‌شوند.', example: 'Running' },
      AGE_COL,
    ],
    example: { title: 'مثال: پیدا کردن دلیل ری‌استارت‌های مداوم یک pod', steps: ['Pods را باز کنید و ردیفی با مقدار بالای Restarts، مثلاً 14، و Ready برابر 0/1 پیدا کنید.', 'آیکون Logs (فایل) را بزنید و ۳۰۰ خط آخر را بخوانید؛ خطاهای انتهای لاگ معمولاً کرش را توضیح می‌دهند.', '"Previous instance" را بزنید تا لاگ کانتینر پیش از آخرین ری‌استارت را ببینید.', 'پنل جزئیات را باز کنید و تب Events را برای دلایلی مثل OOMKilled یا probeهای ناموفق بخوانید.'] },
    tips: ['حذف podی که توسط Deployment مدیریت می‌شود فقط باعث می‌شود Kubernetes یکی جدید راه بیندازد؛ برای حذف برنامه، Deployment را حذف کنید.', 'Shell مربوط به pod داخل کانتینر "sh" را امتحان می‌کند؛ imageهای حداقلی ممکن است shell نداشته باشند.', 'وقتی نمی‌دانید pod کجاست، از "All namespaces" برای پیدا کردنش استفاده کنید.'],
  });

  data['kubernetes/deployments'] = listPage({
    title: 'Deployments',
    faTitle: 'Deployments (دیپلویمنت‌ها)',
    namespaced: true,
    summary: 'Deploymentها را فهرست می‌کند؛ روش استاندارد اجرای یک برنامه stateless: شما می‌گویید کدام image و چند نسخه می‌خواهید و Kubernetes همان تعداد pod را در حال اجرا نگه می‌دارد و به‌روزرسانی‌ها را انجام می‌دهد.',
    whenToUse: ['می‌خواهید یک برنامه را کم یا زیاد (scale) کنید.', 'بعد از تغییر پیکربندی باید برنامه را ری‌استارت کنید.', 'یک rollout گیر کرده به نظر می‌رسد (Progressing یا Unavailable).'],
    how: 'هر ردیف یک Deployment است. podها را از طریق یک replica set مدیریت می‌کند: image را عوض کنید تا podها به‌تدریج جایگزین شوند (rolling update). Status: Available (سبز) همه replicaها آماده‌اند، Progressing (کهربایی) بعضی آماده‌اند، Unavailable (قرمز) هیچ‌کدام، Scaled to zero (خاکستری).',
    footerText: 'در پایین پنل Scale (یک عدد replica از 0 تا 1000 می‌پرسد؛ 0 همه podها را متوقف می‌کند اما Deployment را نگه می‌دارد)، Restart rollout (تأیید می‌گیرد و بعد podها را یکی‌یکی جایگزین می‌کند)، یک دکمه قرمز Delete و Ask AI هست.',
    cmdText: 'نمونه‌ها: describe، rollout status، rollout history، podها، و دستورهای نوشتنی برای scale و restart.',
    columns: [
      NAME_COL('نام Deployment.'),
      { name: 'Ready', meaning: 'replicaهای آماده از تعداد مطلوب.', example: '2/3 یعنی یک pod هنوز آماده نیست' },
      { name: 'Updated', meaning: 'replicaهایی که از قبل با جدیدترین قالب pod اجرا می‌شوند.', example: '3' },
      { name: 'Available', meaning: 'replicaهایی که به‌اندازه کافی طولانی آماده بوده‌اند تا available حساب شوند.', example: '3' },
      { name: 'Image', meaning: 'image کانتینر اول.', example: 'nginx:1.25' },
      { name: 'Status', meaning: 'خلاصه‌ای از ستون‌های بالا.', example: 'Progressing' },
      AGE_COL,
    ],
    example: { title: 'مثال: scale کردن یک Deployment به ۵ replica', steps: ['Deployments را باز کنید و روی ردیف "shop-api" کلیک کنید.', 'در پایین پنل Scale را بزنید و 5 را وارد کنید.', 'پس از بارگذاری دوباره صفحه، با راه‌افتادن podهای جدید ستون Ready از 3/5 به 5/5 می‌رود.', 'اگر زیر ۵ ماند، Pods را باز کنید و podهای جدید را از نظر Pending یا خطا بررسی کنید.'] },
    tips: ['scale به 0 راهی سریع برای متوقف کردن موقت یک برنامه بدون از دست دادن پیکربندی آن است.', 'Restart rollout podها را به‌تدریج جایگزین می‌کند، پس کاربران نباید قطعی ببینند.', 'Delete، Deployment و podهایش را حذف می‌کند.'],
  });

  data['kubernetes/statefulsets'] = listPage({
    title: 'StatefulSets',
    faTitle: 'StatefulSets (استیتفول‌ست‌ها)',
    namespaced: true,
    summary: 'StatefulSetها را فهرست می‌کند؛ برنامه‌هایی که هویت ثابت و ذخیره‌سازی اختصاصی لازم دارند، مثل پایگاه‌داده‌ها و message brokerها را اجرا می‌کنند.',
    whenToUse: ['پایگاه‌داده یا صفی را داخل کلاستر اجرا می‌کنید و می‌خواهید آن را بررسی کنید.', 'باید یک برنامه stateful را scale یا ری‌استارت کنید.'],
    how: 'برخلاف Deployment، podهای StatefulSet نام ثابت می‌گیرند (db-0، db-1) و به‌ترتیب راه می‌افتند، و هر کدام می‌تواند volume مخصوص خودش را نگه دارد. Status وقتی replicaهای آماده به تعداد مطلوب برسند Ready (سبز) است، در غیر این صورت Progressing (کهربایی)، و Scaled to zero (خاکستری).',
    footerText: 'در پایین پنل Scale (0 تا 1000)، Restart rollout، یک دکمه قرمز Delete و Ask AI هست.',
    cmdText: 'نمونه‌ها: describe، rollout status، rollout history، podها، به‌علاوه دستورهای نوشتنی برای scale و restart.',
    columns: [
      NAME_COL('نام StatefulSet.'),
      { name: 'Ready', meaning: 'replicaهای آماده از تعداد مطلوب.', example: '2/3' },
      { name: 'Current', meaning: 'replicaهایی که revision فعلی را اجرا می‌کنند.', example: '3' },
      { name: 'Updated', meaning: 'replicaهایی که جدیدترین revision را اجرا می‌کنند.', example: '3' },
      { name: 'Image', meaning: 'image کانتینر اول.', example: 'postgres:16' },
      { name: 'Status', meaning: 'Ready، Progressing یا Scaled to zero.', example: 'Ready' },
      AGE_COL,
    ],
    example: { title: 'مثال: بررسی یک کلاستر پایگاه‌داده بعد از ری‌استارت', steps: ['StatefulSets را باز کنید و "postgres" را پیدا کنید.', 'Ready را بخوانید: 3/3 یعنی همه نمونه‌ها برگشته‌اند.', 'اگر 2/3 نشان داد، روی ردیف کلیک کنید و تب Events را باز کنید، سپس pod مربوطه (postgres-2) را در صفحه Pods ببینید.'] },
    tips: ['حذف یک StatefulSet معمولاً volumeهای آن (claimها) را سر جایشان می‌گذارد؛ بعد از آن Volume claims را بررسی کنید.', 'scale down ابتدا podی با بزرگ‌ترین شماره را حذف می‌کند.'],
  });

  data['kubernetes/daemonsets'] = listPage({
    title: 'DaemonSets',
    faTitle: 'DaemonSets (دیمون‌ست‌ها)',
    namespaced: true,
    summary: 'DaemonSetها را فهرست می‌کند؛ روی هر node (یا مجموعه‌ای انتخابی از nodeها) دقیقاً یک pod اجرا می‌کنند. کاربردهای رایج: ارسال لاگ، عامل‌های مانیتورینگ و پلاگین‌های شبکه.',
    whenToUse: ['می‌خواهید بدانید عامل node روی همه nodeها اجرا می‌شود یا نه.', 'یک node جدید عامل لاگ یا مانیتورینگ ندارد.'],
    how: 'تعداد podها از تعداد nodeها پیروی می‌کند، پس عددی برای replica وجود ندارد. Status: Ready (سبز) وقتی ready به desired برسد، Progressing (کهربایی) اگر بعضی available باشند، Unavailable (قرمز) اگر هیچ‌کدام نباشند.',
    footerText: 'در پایین پنل Restart rollout (بدون Scale، چون تعداد از nodeها پیروی می‌کند)، یک دکمه قرمز Delete و Ask AI هست.',
    cmdText: 'نمونه‌ها: describe، rollout status، rollout history، podها، و یک دستور نوشتنی برای restart.',
    columns: [
      NAME_COL('نام DaemonSet.'),
      { name: 'Desired', meaning: 'nodeهایی که باید pod اجرا کنند.', example: '3' },
      { name: 'Ready', meaning: 'podهای آماده.', example: '2' },
      { name: 'Available', meaning: 'podهایی که به‌اندازه کافی طولانی available بوده‌اند.', example: '2' },
      { name: 'Updated', meaning: 'podهایی که جدیدترین قالب را اجرا می‌کنند.', example: '3' },
      { name: 'Image', meaning: 'image کانتینر اول.', example: 'fluent/fluent-bit:3.0' },
      { name: 'Status', meaning: 'Ready، Progressing یا Unavailable.', example: 'Progressing' },
      AGE_COL,
    ],
    example: { title: 'مثال: پیدا کردن nodeای که عاملش را ندارد', steps: ['DaemonSets را باز کنید و Desired (3) را با Ready (2) مقایسه کنید.', 'Pods را باز کنید، با نام DaemonSet فیلتر کنید و دنبال ستون Node بگردید که podی ندارد یا podش خراب است.', 'تب Events آن pod را برای دلیل بخوانید.'] },
    tips: ['DaemonSetهای سیستمی (مثلاً kube-proxy در kube-system) حیاتی هستند؛ ری‌استارت آن‌ها شبکه را برای مدت کوتاهی مختل می‌کند.'],
  });

  data['kubernetes/jobs'] = listPage({
    title: 'Jobs',
    faTitle: 'Jobs (جاب‌ها)',
    namespaced: true,
    summary: 'Jobها را فهرست می‌کند: کارهای یک‌باره که یک pod را اجرا می‌کنند تا با موفقیت تمام شود، مثل migration پایگاه‌داده یا import دسته‌ای.',
    whenToUse: ['می‌خواهید بدانید یک کار دسته‌ای تمام شده یا شکست خورده است.', 'یک CronJob یک Job راه انداخته و نتیجه‌اش را می‌خواهید.'],
    how: 'Job چند pod می‌سازد و در صورت شکست دوباره تلاش می‌کند تا تعداد مورد نظر completion موفق شود. Status: Complete (سبز)، Failed (قرمز)، Running (فیروزه‌ای، podها فعال‌اند)، Pending (کهربایی).',
    footerText: DELETE_ONLY_FOOTER + ' حذف یک job تمام‌شده podها و لاگ‌هایش را هم پاک می‌کند.',
    cmdText: 'نمونه‌ها: jobها (wide)، describe، لاگ‌های اولین pod همان job و podها.',
    columns: [
      NAME_COL('نام Job. Jobهای ساخته‌شده از یک CronJob به یک پسوند شبیه timestamp ختم می‌شوند.'),
      { name: 'Completions', meaning: 'podهای موفق از تعداد مورد نظر.', example: '1/1 یعنی تمام شده' },
      { name: 'Succeeded', meaning: 'تعداد podهایی که با موفقیت تمام شده‌اند.', example: '1' },
      { name: 'Failed', meaning: 'تعداد podهای ناموفق؛ بالای صفر قرمز است.', example: '3 یعنی سه تلاش شکست خورده' },
      { name: 'Active', meaning: 'podهایی که همین حالا در حال اجرا هستند.', example: '1' },
      { name: 'Duration', meaning: 'مدت از شروع تا اتمام (یا تا همین حالا اگر هنوز در حال اجراست).', example: '45s or 12m' },
      { name: 'Status', meaning: 'Complete، Failed، Running یا Pending.', example: 'Failed' },
      AGE_COL,
    ],
    example: { title: 'مثال: دیدن دلیل شکست یک job مربوط به migration', steps: ['Jobs را باز کنید و روی ردیف قرمز Failed کلیک کنید.', 'در تب Commands مورد "Logs" را پیدا کنید و play را بزنید تا لاگ اولین pod را بخوانید.', 'علت را برطرف کنید، Job قدیمی را حذف کنید و از manifest خودتان دوباره راه بیندازید (OpsDeck Job نمی‌سازد).'] },
    tips: ['Jobی که تمام شده تا زمانی که حذف نشود در فهرست می‌ماند.', 'Failed برابر 3 معمولاً یعنی تلاش‌های مجدد تمام شده است (backoff limit)، که در تب Summary نشان داده می‌شود.'],
  });

  data['kubernetes/cronjobs'] = listPage({
    title: 'CronJobs',
    faTitle: 'CronJobs (کران‌جاب‌ها)',
    namespaced: true,
    summary: 'CronJobها را فهرست می‌کند: Jobهایی که Kubernetes طبق زمان‌بندی راه می‌اندازد، مثل ابزار cron در لینوکس. برای پشتیبان‌گیری، گزارش و پاکسازی استفاده می‌شوند.',
    whenToUse: ['می‌خواهید مطمئن شوید یک کار زمان‌بندی‌شده سر وقت اجرا می‌شود.', 'یک کار زمان‌بندی‌شده متوقف (suspended) به نظر می‌رسد.'],
    how: 'ستون Schedule از نحو cron استفاده می‌کند (پنج فیلد: دقیقه، ساعت، روز ماه، ماه، روز هفته). هر اجرا یک Job می‌سازد که در صفحه Jobs می‌بینید. Status: Suspended (کهربایی)، Active (سبز، یک job همین حالا در حال اجراست)، Idle (خاکستری).',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'نمونه‌ها: cronjobها، describe، jobها، و یک دستور نوشتنی "Trigger now" که از روی CronJob یک Job یک‌باره می‌سازد.',
    columns: [
      NAME_COL('نام CronJob.'),
      { name: 'Schedule', meaning: 'عبارت cron برای زمان اجرا.', example: '0 2 * * * یعنی هر روز ساعت 02:00' },
      { name: 'Suspended', meaning: 'نشان: "active" (سبز) اگر طبق زمان‌بندی اجرا می‌شود یا "suspended" (کهربایی) اگر متوقف است.', example: 'active' },
      { name: 'Active', meaning: 'تعداد jobهایی که همین حالا در حال اجرا هستند.', example: '0' },
      { name: 'Last Schedule', meaning: 'زمان آخرین اجرا.', example: 'یک timestamp مثل 2026-11-12T02:00:00Z' },
      { name: 'Status', meaning: 'Suspended، Active یا Idle.', example: 'Idle' },
      AGE_COL,
    ],
    example: { title: 'مثال: بررسی اینکه پشتیبان‌گیری دیشب اجرا شده', steps: ['CronJobs را باز کنید و "nightly-backup" را با زمان‌بندی 0 2 * * * پیدا کنید.', 'Last Schedule را ببینید تا مطمئن شوید ساعت 02:00 اجرا شده است.', 'Jobs را باز کنید تا ببینید Jobی که ساخته Complete است یا Failed.'] },
    tips: ['زمان‌ها به UTC هستند مگر اینکه CronJob یک time zone تعیین کرده باشد.', 'از دستور "Trigger now" (تأیید می‌گیرد) برای یک اجرای دستی استفاده کنید.'],
  });

  // ------------------------------------------------------------------ networking
  data['kubernetes/services'] = listPage({
    title: 'Services',
    faTitle: 'Services (سرویس‌ها)',
    namespaced: true,
    summary: 'Serviceها را فهرست می‌کند: آدرس‌های شبکه‌ای ثابت که به گروهی از podها یک نام و یک IP می‌دهند، تا برنامه‌های دیگر حتی با آمدن و رفتن podها بتوانند به آن‌ها برسند.',
    whenToUse: ['یک برنامه نمی‌تواند به برنامه دیگری داخل کلاستر برسد.', 'باید بدانید یک برنامه روی کدام پورت یا آدرس خارجی در دسترس است.'],
    how: 'Service با Selector خودش (تطبیق label) podها را انتخاب می‌کند و ترافیک را بینشان پخش می‌کند. Type مشخص می‌کند چه کسی می‌تواند به آن برسد: ClusterIP (فقط از داخل)، NodePort (روی یک پورت از هر node هم)، LoadBalancer (یک IP خارجی از سرویس ابری)، ExternalName (یک نام مستعار برای یک نام DNS بیرونی).',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'نمونه‌ها: serviceها (wide)، endpoints، describe، و یک دستور فقط‌کپی port-forward.',
    columns: [
      NAME_COL('نام Service، که نام DNS آن در namespace هم هست.'),
      { name: 'Type', meaning: 'ClusterIP (خاکستری)، NodePort (بنفش)، LoadBalancer (فیروزه‌ای)، ExternalName (کهربایی).', example: 'LoadBalancer' },
      { name: 'Cluster IP', meaning: 'IP مجازی داخلی. "None" یعنی service از نوع headless است.', example: '10.96.14.2' },
      { name: 'External', meaning: 'IPهای خارجی یا آدرس load balancer، اگر وجود داشته باشد.', example: '34.120.1.5' },
      { name: 'Ports', meaning: 'پورت service، پروتکل و، برای NodePort، پورت node بعد از یک فلش.', example: '80/TCP->30080' },
      { name: 'Selector', meaning: 'labelهایی که برای پیدا کردن podهای پشتیبان به‌کار می‌روند.', example: 'app=shop-web' },
      AGE_COL,
    ],
    example: { title: 'مثال: پیدا کردن دلیل اینکه یک service پشتیبان ندارد', steps: ['Services را باز کنید و Selector مربوط به "shop-web" (app=shop-web) را یادداشت کنید.', 'دستور "Endpoints" را از تب Commands اجرا کنید؛ endpoints خالی یعنی هیچ pod آماده‌ای تطبیق ندارد.', 'Pods را باز کنید و بررسی کنید که podها label برابر app=shop-web دارند و Ready نشان می‌دهند.'] },
    tips: ['آدرس خارجی "pending" روی یک LoadBalancer معمولاً یعنی سرویس ابری هنوز آدرسی اختصاص نداده است.', 'Port-forward فقط‌کپی است چون به ترمینال خودتان نیاز دارد.'],
  });

  data['kubernetes/ingresses'] = listPage({
    title: 'Ingresses',
    faTitle: 'Ingresses (اینگرس‌ها)',
    namespaced: true,
    summary: 'Ingressها را فهرست می‌کند: قاعده‌هایی که ترافیک وب را از بیرون کلاستر (بر اساس نام host و path) به Serviceهای داخل آن هدایت می‌کنند.',
    whenToUse: ['یک وب‌سایت در دسترس نیست و می‌خواهید قاعده‌های مسیریابی آن را بررسی کنید.', 'باید ببینید چه نام hostها و تنظیمات TLS وجود دارد.'],
    how: 'Ingress فقط مجموعه‌ای از قاعده‌هاست؛ برای اجرای آن‌ها باید یک ingress controller (مثلاً nginx) نصب باشد. Class نشان می‌دهد کدام controller آن را مدیریت می‌کند. Address وقتی controller در دسترس قرار بگیرد پر می‌شود. بخش Summary در پنل جزئیات قاعده‌ها را به شکل host و path به service فهرست می‌کند.',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'نمونه‌ها: ingressها (wide)، ingress classها (controllerهای نصب‌شده) و describe.',
    columns: [
      NAME_COL('نام Ingress.'),
      { name: 'Class', meaning: 'کدام ingress controller آن را مدیریت می‌کند.', example: 'nginx' },
      { name: 'Hosts', meaning: 'نام hostهایی که قاعده‌ها به آن‌ها پاسخ می‌دهند.', example: 'shop.example.com' },
      { name: 'TLS', meaning: '"yes" اگر گواهی HTTPS تنظیم شده باشد، در غیر این صورت "no".', example: 'yes' },
      { name: 'Address', meaning: 'IP خارجی یا نام hostی که controller اختصاص داده است.', example: '203.0.113.10' },
      AGE_COL,
    ],
    example: { title: 'مثال: بررسی اینکه HTTPS تنظیم شده است', steps: ['Ingresses را باز کنید و host خود را در ستون Hosts پیدا کنید.', 'ستون TLS باید "yes" باشد.', 'روی ردیف کلیک کنید و بخش Rules را برای نگاشت host/path به service بخوانید، سپس در صفحه Services بررسی کنید که service هدف وجود دارد.'] },
    tips: ['Address خالی اغلب یعنی ingress controller نصب نیست یا آماده نیست.', 'نبود Class در کلاستری با چند controller می‌تواند یعنی هیچ‌کس آن قاعده را مدیریت نمی‌کند.'],
  });

  data['kubernetes/networkpolicies'] = listPage({
    title: 'Network policies',
    faTitle: 'Network policies (سیاست‌های شبکه)',
    namespaced: true,
    summary: 'NetworkPolicyها را فهرست می‌کند: قاعده‌هایی شبیه فایروال که تعیین می‌کنند کدام podها اجازه دارند با کدام podهای دیگر صحبت کنند.',
    whenToUse: ['podها نمی‌توانند به هم برسند و گمان می‌کنید یک policy جلوی آن‌ها را گرفته.', 'دارید بررسی می‌کنید یک namespace چقدر قفل شده است.'],
    how: 'به‌طور پیش‌فرض هر pod می‌تواند به هر podی برسد. وقتی یک policy یک pod را انتخاب کند، فقط ترافیکی که policy اجازه می‌دهد عبور می‌کند. Types نشان می‌دهد policy ترافیک Ingress (ورودی)، Egress (خروجی) یا هر دو را کنترل می‌کند. اجرای آن به پلاگین شبکه‌ای نیاز دارد که از policy پشتیبانی کند.',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'نمونه‌ها: policyها، describe و podها با labelهایشان (policyها بر اساس label تطبیق می‌دهند).',
    columns: [
      NAME_COL('نام policy.'),
      { name: 'Pod selector', meaning: 'labelهای podهایی که policy روی آن‌ها اعمال می‌شود. "All pods" یعنی همه podهای namespace.', example: 'app=db' },
      { name: 'Types', meaning: 'جهت‌هایی که policy کنترل می‌کند.', example: 'Ingress, Egress' },
      AGE_COL,
    ],
    example: { title: 'مثال: چرا pod وب نمی‌تواند به پایگاه‌داده برسد؟', steps: ['Network policies را باز کنید و policyای را پیدا کنید که Pod selector آن app=db است.', 'روی آن کلیک کنید و تب Summary یا Describe را برای منبع‌های مجاز بخوانید.', 'با دستور "Pods" بررسی کنید که labelهای pod وب با یک منبع مجاز می‌خواند.'] },
    tips: ['policyای با selector خالی ("All pods") و نوع Ingress ولی بدون قاعده allow، همه ترافیک ورودی را مسدود می‌کند.', 'حذف یک policy ترافیک را دوباره باز می‌کند، پس در production مراقب باشید.'],
  });

  Object.assign(OD.helpFa, data);
})();
