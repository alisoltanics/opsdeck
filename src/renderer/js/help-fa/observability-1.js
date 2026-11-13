'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.helpFa = OD.helpFa || {};

  // Elements shared by every Observability page.
  const HEADER = {
    name: 'Page header (سربرگ صفحه)',
    description: 'هر صفحه از Observability با یک عنوان، یک توضیح یک‌خطی و همان دکمه‌های ثابت در سمت راست شروع می‌شود.',
    items: [
      { name: 'Refresh', description: 'صفحه را دوباره از سرویس مانیتورینگ می‌خواند و پیام "Refreshed" را نشان می‌دهد. صفحه‌هایی که بازخوانی خودکار ۳۰ ثانیه‌ای ندارند (logs، traces، alerts، settings و چند صفحهٔ دیگر) فقط وقتی به‌روز می‌شوند که روی این دکمه بزنید یا یک فیلتر را عوض کنید.' },
      { name: 'Ask AI', description: 'دستیار هوش مصنوعی را با همین صفحهٔ Observability به‌عنوان زمینه باز می‌کند تا دربارهٔ چیزی که می‌بینید سؤال بپرسید. دستیار هرگز خودش اقدام اصلاحی اجرا نمی‌کند.' },
    ],
  };
  const RANGE = {
    name: 'Range selector (انتخاب بازهٔ زمانی)',
    description: 'منوی کشویی در سربرگ با گزینه‌های Last 15 minutes، Last hour، Last 6 hours، Last 24 hours، Last 7 days و Last 30 days. بازهٔ زمانی نمودارها و روندها را تعیین می‌کند. این انتخاب بین صفحه‌هایی که آن را نشان می‌دهند مشترک است (Overview، Docker، Kubernetes، Databases، Applications، Metrics explorer و Dashboards).',
  };
  const LIVE_NOTE = 'این صفحه تا وقتی باز و قابل‌مشاهده است هر ۳۰ ثانیه خودش را به‌روز می‌کند و حدود ۳ ثانیه بعد از باز شدن هم یک بار دیگر به‌روز می‌شود تا نخستین نمونه بدون کلیک نمایش داده شود.';
  const COLLECTOR_NOTE = {
    name: 'Collector banners (بنرهای collector)',
    description: 'یک بنر آبی یا زرد در بالای صفحه وضعیت collector پشت آن صفحه را توضیح می‌دهد: "Waiting for the first sample" (collector هنوز اجرای اولش را تمام نکرده)، "Collector disabled" (آن را در Settings روشن کنید)، "Source unavailable" (منبع در این محیط قابل خواندن نیست) یا "Partial result" (بعضی بخش‌ها شکست خورده‌اند و دلیل‌ها فهرست شده‌اند).',
  };

  Object.assign(OD.helpFa, {
    'observability/overview': {
      title: 'Health overview (نمای کلی سلامت)',
      summary: 'یک تصویر زنده و یکپارچه از همهٔ چیزهایی که OpsDeck مانیتور می‌کند: یک امتیاز سلامت، CPU و memory و disk همین دستگاه، تعداد hostها، serviceها، containerها، clusterها، databaseها، alertها و incidentها، و مواردی که همین الان به توجه نیاز دارند.',
      whenToUse: [
        'شروع روز است و می‌خواهید بدانید چیزی خراب هست یا نه.',
        'یک alert فعال شده و می‌خواهید ببینید کدام منابع تحت تأثیرند.',
        'می‌خواهید مطمئن شوید همهٔ collectorها در حال اجرا هستند و داده برمی‌گردانند.',
      ],
      howItWorks: [
        'همه‌چیز را collectorهایی اندازه می‌گیرند که طبق زمان‌بندی (به‌صورت پیش‌فرض هر ۱۰ ثانیه) داخل خود OpsDeck اجرا می‌شوند. هیچ‌چیز در این صفحه شبیه‌سازی نشده است: وقتی منبعی قابل خواندن نباشد، مقدار به‌صورت خط تیره نمایش داده می‌شود یا کارت می‌گوید در دسترس نیست.',
        'امتیاز سلامت میانگین وزنی مؤلفه‌هایی است که داده دارند: hosts، containers، clusters، databases و services. مؤلفه‌های بدون داده کنار گذاشته می‌شوند و با عنوان "Missing" فهرست می‌شوند. امتیاز ۹۰ یا بیشتر Healthy است، ۷۰ تا ۸۹ Degraded و کمتر از ۷۰ Critical.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        {
          name: 'Header buttons (Overview only) (دکمه‌های سربرگ، فقط در Overview)',
          description: 'علاوه بر Refresh و Ask AI، این صفحه یک دکمهٔ اضافه دارد.',
          items: [{ name: 'Open dashboards', description: 'به صفحهٔ Dashboards می‌رود.' }],
        },
        { name: 'Partial coverage banner (بنر پوشش ناقص)', description: 'وقتی بعضی بخش‌ها اندازه‌گیری نشده باشند ظاهر می‌شود، مثلاً "Kubernetes not connected". دقیقاً فهرست می‌کند چه چیزی کم است تا امتیاز خوب با پوشش کامل اشتباه گرفته نشود.' },
        {
          name: 'Health score card (کارت امتیاز سلامت)',
          description: 'یک نمودار donut با امتیاز ۰ تا ۱۰۰ و برچسب آن (Healthy، Degraded، Critical یا Unknown). زیر آن فرمولی که استفاده شده است قرار دارد، مثلاً "Weighted average over available components: Hosts 100.0x0.25 + Containers 80.0x0.2 ... / 0.65"، و فهرست مؤلفه‌های ناموجود.',
        },
        {
          name: 'Stat cards (کارت‌های آماری)',
          description: 'شش عدد کلیدی.',
          items: [
            { name: 'CPU', description: 'میانگین مصرف CPU در همهٔ هسته‌های این دستگاه، همراه با تعداد هسته، میانگین load یک‌دقیقه‌ای و یک sparkline کوچک. مثال: 34.2% - 8 cores - load 1.4.' },
            { name: 'Memory', description: 'درصد حافظهٔ سیستم که در حال استفاده است، همراه با کل حافظهٔ نصب‌شده.' },
            { name: 'Disk pressure', description: 'میزان استفاده از پرترین filesystem متصل‌شده. از ۷۰٪ نارنجی و از ۹۰٪ قرمز می‌شود.' },
            { name: 'Hosts', description: 'hostهای آنلاین از کل hostها (همین دستگاه به‌اضافهٔ سرورهای راه دور). "2 unreachable" یعنی دو سرور راه دور به آخرین بررسی پاسخ نداده‌اند.' },
            { name: 'Services', description: 'تعداد synthetic checkهای سالم از کل، همراه با تعداد degraded و failed.' },
            { name: 'Active alerts', description: 'alertهایی که firing یا pending هستند و تعداد critical بودن آن‌ها.' },
          ],
        },
        {
          name: 'Inventory tiles (کاشی‌های موجودی)',
          description: 'شش کاشی کوچک که صفحه‌های دیگر را خلاصه می‌کنند: Docker (containerهای در حال اجرا از کل)، Kubernetes (nodeهای ready از کل)، Databases (اتصال‌های اندازه‌گیری‌شده از کل)، Applications (serviceهایی که span گزارش می‌کنند)، Incidents (incidentهای باز) و Agents (تعداد agentهای متصل، یا "Off" وقتی ingest receiver متوقف است).',
        },
        {
          name: 'CPU trend and Memory trend (روند CPU و Memory)',
          description: 'دو نمودار area برای بازهٔ انتخاب‌شده، با مقیاس ۰ تا ۱۰۰٪. تا وقتی دست‌کم دو tick جمع‌آوری انجام نشده باشد خالی می‌مانند.',
        },
        {
          name: 'Top consumers (پرمصرف‌ترین‌ها)',
          description: 'سنگین‌ترین مصرف‌کنندگان CPU در همین لحظه در میان containerها، processها و podهای Kubernetes. هر ردیف نوع، نام، میزان مصرف و یک جزئیات مثل image یا namespace را نشان می‌دهد.',
        },
        {
          name: 'Needs attention (نیازمند توجه)',
          description: 'synthetic checkهای ناموفق، containerهای unhealthy و serviceهای غیرقابل‌دسترس، هرکدام با یک آیکن قرمز و دلیل کوتاه. اگر خالی باشد، "No active problems" نمایش داده می‌شود.',
        },
        {
          name: 'Collectors card (کارت Collectors)',
          description: 'یک ردیف برای هر collector (local، network، docker، kubernetes، databases، synthetic، remote، logs، applications). هر collector مستقل اجرا می‌شود، پس خرابی یکی جلوی بقیه را نمی‌گیرد.',
        },
        {
          name: 'Active alerts and Open incidents (alertهای فعال و incidentهای باز)',
          description: 'دو فهرست در پایین صفحه با تازه‌ترین alertهای firing یا pending و incidentهای باز. دکمه‌های "All alerts" و "All incidents" صفحه‌های کامل را باز می‌کنند.',
        },
      ],
      tables: [
        {
          name: 'Collectors table (جدول Collectors)',
          description: 'نشان می‌دهد هر منبع داده کار می‌کند یا نه.',
          columns: [
            { name: 'Collector', meaning: 'نام نمایشی و کلید داخلی collector.', example: 'Docker (docker)' },
            { name: 'State', meaning: 'Running وقتی آخرین اجرا موفق بوده، Unavailable وقتی به منبع دسترسی نیست، Error وقتی اجرا شکست خورده و Disabled وقتی آن را در Settings خاموش کرده‌اید.', example: 'Running' },
            { name: 'Metrics', meaning: 'آخرین اجرا چند نقطهٔ داده تولید کرده است.', example: '142' },
            { name: 'Duration', meaning: 'آخرین اجرا چقدر طول کشیده است.', example: '380 ms' },
            { name: 'Last run', meaning: 'زمان گذشته از آخرین اجرا، یا "waiting" اگر هنوز اجرا نشده باشد.', example: '8 seconds ago' },
            { name: 'Detail', meaning: 'دلیل یا نخستین خطا، کوتاه‌شده تا ۸۰ نویسه.', example: 'Docker engine not reachable' },
          ],
        },
        {
          name: 'Top consumers table (جدول Top consumers)',
          columns: [
            { name: 'Kind', meaning: 'عدد از کجا می‌آید: container، process یا pod.', example: 'container' },
            { name: 'Name', meaning: 'نام مصرف‌کننده.', example: 'api-1' },
            { name: 'Usage', meaning: 'مصرف فعلی CPU.', example: '62.5%' },
            { name: 'Detail', meaning: 'اطلاعات بیشتر مثل image.', example: 'nginx:1.27' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن دلیل افت امتیاز به ۷۴',
        steps: [
          'Health overview را باز کنید. donut عدد ۷۴ و برچسب "Degraded" را نشان می‌دهد.',
          'فرمول زیر برچسب را بخوانید تا ببینید کدام مؤلفه میانگین را پایین کشیده است، مثلاً Containers 60.',
          'به بخش "Needs attention" نگاه کنید. در آن نوشته شده "api-1 - container - unhealthy".',
          'روی "All alerts" بزنید تا ببینید قاعده‌ای برای آن فعال شده یا نه، یا برای جزئیات container صفحهٔ Docker را باز کنید.',
        ],
      },
      tips: [
        'مؤلفهٔ ناموجود سالم حساب نمی‌شود. امتیاز بالا همراه با چند مورد "Missing" فقط وضعیت بخش‌های اندازه‌گیری‌شده را نشان می‌دهد.',
        'خالی بودن نمودارها درست بعد از شروع عادی است. صبر کنید تا دو tick جمع‌آوری انجام شود (با بازهٔ پیش‌فرض حدود ۲۰ ثانیه).',
        'collectorهایی را که استفاده نمی‌کنید در Settings خاموش کنید تا به‌عنوان خطا نمایش داده نشوند.',
      ],
    },

    'observability/infrastructure': {
      title: 'Infrastructure (زیرساخت)',
      summary: 'جزئیات دستگاهی که OpsDeck روی آن اجرا می‌شود و فهرست سرورهای راه دوری که از طریق SSH، یک Prometheus node exporter یا یک OpsDeck agent وصل می‌کنید.',
      whenToUse: [
        'می‌خواهید diskها، network interfaceها و پرمصرف‌ترین processهای این دستگاه را ببینید.',
        'می‌خواهید سروری را برای مانیتورینگ اضافه کنید و مطمئن شوید پاسخ می‌دهد.',
      ],
      howItWorks: [
        'بخش "This machine" از collector محلی (local) می‌آید. بخش راه دور از remote collector می‌آید که هر سرور فعال را به‌صورت پیش‌فرض هر ۳۰ ثانیه بررسی می‌کند.',
        'گذرواژه‌های SSH، کلیدهای خصوصی و tokenهای exporter در vault رمزگذاری‌شده ذخیره می‌شوند و بعد از ذخیره دیگر نمایش داده نمی‌شوند.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        COLLECTOR_NOTE,
        {
          name: 'This machine (این دستگاه)',
          description: 'یک کارت با اطلاعات host محلی و چهار meter.',
          items: [
            { name: 'Add server', description: 'فرم "Add remote server" را باز می‌کند (در کارت Remote servers هم موجود است).' },
            { name: 'Facts list', description: 'hostname، سیستم‌عامل، kernel، معماری، مدل CPU، تعداد هسته‌ها، uptime و زمان اندازه‌گیری داده.' },
            { name: 'Meters', description: 'CPU، Memory، Load 1m و Temperature. اگر سنسور قابل خواندن نباشد، Temperature خط تیره نشان می‌دهد.' },
          ],
        },
        { name: 'Filesystems card (کارت Filesystems)', description: 'یک ردیف برای هر filesystem متصل‌شده همراه با نوار میزان استفاده. جدول زیر را ببینید.' },
        { name: 'Interfaces card (کارت Interfaces)', description: 'network interfaceها با آدرس و نرخ زندهٔ دریافت و ارسال که از شمارنده‌های واقعی محاسبه می‌شود.' },
        {
          name: 'Remote servers card (کارت Remote servers)',
          description: 'سرورهایی که اضافه کرده‌اید. اگر هیچ سروری نباشد، یک حالت خالی گزینهٔ "Add your first server" را پیشنهاد می‌دهد.',
          items: [
            { name: 'Add server', description: 'فرم را باز می‌کند. فیلدها: name، collection method (SSH، Prometheus node exporter یا OpsDeck agent)، host و port، exporter URL، SSH username، operating system (Linux یا Windows)، group، environment، tags، agent id، timeout، password، private key، passphrase، exporter bearer token، note، "Collect this server" و "Verify TLS certificates".' },
            { name: 'Test (row)', description: 'همین حالا با سرور تماس می‌گیرد و "Server responded" را همراه با زمان پاسخ، یا "Server did not respond" را همراه با خطا گزارش می‌کند.' },
            { name: 'Edit (row)', description: 'همان فرم را با مقادیر فعلی پر شده باز می‌کند.' },
            { name: 'Delete (row)', description: 'پس از تأیید، مانیتورینگ سرور را متوقف می‌کند و اعتبارنامه‌های ذخیره‌شدهٔ آن را حذف می‌کند.' },
          ],
        },
        { name: 'Processes card (کارت Processes)', description: '۲۰ processی که روی این دستگاه بیشترین CPU را مصرف می‌کنند، با PID، name، user، CPU و memory.' },
      ],
      tables: [
        {
          name: 'Filesystems table (جدول Filesystems)',
          columns: [
            { name: 'Mount', meaning: 'محلی که filesystem در آن mount شده است.', example: '/' },
            { name: 'Filesystem', meaning: 'نوع filesystem.', example: 'ext4' },
            { name: 'Used / Total', meaning: 'فضای استفاده‌شده و اندازهٔ کل.', example: '180 GB / 500 GB' },
            { name: 'Usage', meaning: 'نوار و درصد فضای استفاده‌شده.', example: '36%' },
          ],
        },
        {
          name: 'Remote servers table (جدول Remote servers)',
          columns: [
            { name: 'Server', meaning: 'نام و host یا URL.', example: 'db-1 / 10.0.0.12' },
            { name: 'Method', meaning: 'روش اندازه‌گیری: ssh، prometheus یا agent.', example: 'ssh' },
            { name: 'State', meaning: 'Online یا Offline طبق آخرین بررسی، یا "Not sampled" اگر هنوز بررسی نشده باشد.', example: 'Online' },
            { name: 'CPU / Memory', meaning: 'آخرین مصرف اندازه‌گیری‌شده، فقط وقتی سرور آنلاین است نمایش داده می‌شود.', example: '23.0% / 61.4%' },
            { name: 'Checked', meaning: 'زمان گذشته از آخرین بررسی.', example: '12 seconds ago' },
          ],
        },
      ],
      example: {
        title: 'مثال: مانیتور کردن یک سرور Linux از طریق SSH',
        steps: [
          'روی "Add server" بزنید.',
          'یک نام مثل db-1 وارد کنید، روش را روی SSH بگذارید و host (10.0.0.12)، port 22 و یک SSH username را پر کنید.',
          'یک private key را paste کنید یا password وارد کنید. گزینهٔ "Collect this server" را فعال بگذارید و روی "Add server" بزنید.',
          'روی "Test" در ردیف جدید بزنید. پیام "Server responded" همراه با زمانی بر حسب میلی‌ثانیه یعنی همه‌چیز کار می‌کند.',
          'بعد از poll بعدی، ردیف وضعیت Online و مقادیر CPU و memory را نشان می‌دهد.',
        ],
      },
      tips: [
        'برای مانیتورینگ با SSH از یک حساب مخصوص و فقط‌خواندنی استفاده کنید.',
        'سرورهای Prometheus node exporter به URL کامل metrics نیاز دارند، مثلاً http://10.0.0.12:9100/metrics.',
        'تیک "Verify TLS certificates" را فقط برای exporterهایی بردارید که گواهی self-signed مورد اعتماد شما دارند.',
      ],
    },

    'observability/docker': {
      title: 'Docker',
      summary: 'اندازه‌گیری‌های container، پروژهٔ Compose، storage، network و volume که از Docker engine خوانده می‌شوند.',
      whenToUse: [
        'می‌خواهید بدانید کدام containerها در حال اجرا، restart شدن یا unhealthy هستند و چقدر منبع مصرف می‌کنند.',
        'دنبال containerی هستید که CPU یا memory زیادی مصرف می‌کند.',
      ],
      howItWorks: [
        'داده از Docker collector می‌آید که از engine روی این دستگاه آمار می‌گیرد. memory هر container همان working set است و عبارت "of limit" فقط وقتی دیده می‌شود که container محدودیت حافظه داشته باشد.',
        'اگر به Docker دسترسی نباشد، صفحه همین را می‌گوید و هیچ عددی نشان نمی‌دهد.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        {
          name: 'Stat cards (کارت‌های آماری)',
          description: 'چهار مجموع برای engine.',
          items: [
            { name: 'Containers', description: 'در حال اجرا از کل، همراه با تعداد stopped و restarting.' },
            { name: 'Unhealthy', description: 'containerهایی که health check آن‌ها unhealthy گزارش می‌دهد، و مجموع تعداد restartها. اگر بیشتر از صفر باشد قرمز می‌شود.' },
            { name: 'Container CPU', description: 'مجموع مصرف CPU containerهای در حال اجرا.' },
            { name: 'Container memory', description: 'مجموع حافظهٔ working-set containerهای در حال اجرا.' },
          ],
        },
        { name: 'Containers card (کارت Containers)', description: 'همهٔ containerها با اندازه‌گیری‌هایشان. جدول زیر را ببینید.' },
        { name: 'Compose projects card (کارت Compose projects)', description: 'containerها بر اساس پروژهٔ Compose گروه‌بندی شده‌اند: running/total، CPU، memory، یک نشان سبز "healthy" یا قرمز "N unhealthy" و مسیر پروژه.' },
        { name: 'Storage card (کارت Storage)', description: 'گزارش مصرف disk توسط engine بر اساس نوع (images، containers، volumes، build cache): تعداد آیتم، آیتم‌های فعال، اندازه و مقداری که قابل آزادسازی است.' },
        { name: 'Engine card (کارت Engine)', description: 'نسخهٔ Docker، سیستم‌عامل، معماری و زمان اندازه‌گیری.' },
        { name: 'Networks and Volumes cards (کارت‌های Networks و Volumes)', description: 'Networks نام، driver، containerهای متصل و scope را فهرست می‌کند. Volumes نام، driver و mount point را. اندازهٔ volume عبارت "usage unavailable" را نشان می‌دهد چون Docker فقط metadata گزارش می‌کند، نه بایت.' },
      ],
      tables: [
        {
          name: 'Containers table (جدول Containers)',
          columns: [
            { name: 'Container', meaning: 'نام و id کوتاه.', example: 'api-1 / 3f2a9c1b7d4e' },
            { name: 'Image', meaning: 'imageای که container اجرا می‌کند (کوتاه‌شده تا ۴۰ نویسه).', example: 'nginx:1.27' },
            { name: 'State', meaning: 'running، exited، restarting و غیره. اگر health check شکست بخورد یک نشان قرمز "unhealthy" هم اضافه می‌شود.', example: 'running' },
            { name: 'CPU', meaning: 'مصرف فعلی CPU توسط container.', example: '4.2%' },
            { name: 'Memory', meaning: 'حافظهٔ working-set و، اگر محدودیت تعیین شده باشد، درصد آن نسبت به محدودیت.', example: '210 MB, 41% of limit' },
            { name: 'Net in / out', meaning: 'مجموع بایت‌های دریافتی و ارسالی.', example: '1.2 GB / 340 MB' },
            { name: 'Restarts', meaning: 'Docker چند بار container را restart کرده است. عدد رو به رشد یعنی crash loop.', example: '7' },
          ],
        },
      ],
      example: {
        title: 'مثال: تشخیص containerی که مدام crash می‌کند',
        steps: [
          'Docker را باز کنید و به کارت Containers نگاه کنید. تعداد Restarting برابر ۱ و Unhealthy برابر ۱ است.',
          'در جدول ردیفی را پیدا کنید که عدد Restarts بالایی دارد، مثلاً worker-1 با ۱۴.',
          'صفحهٔ Alerts را باز کنید تا ببینید قاعدهٔ "Docker container unhealthy" فعال شده یا نه، یا برای خواندن logهای container وارد workspace مربوط به Docker شوید.',
        ],
      },
      tips: [
        'وقتی پیام "Docker metrics are unavailable" را دیدید، Docker را روشن کنید و روی Refresh بزنید.',
        'برای انجام کار روی یک container (مثل restart یا stop) از صفحه‌های Docker در نوار کناری استفاده کنید. این صفحه فقط اندازه‌گیری می‌کند.',
      ],
    },

    'observability/kubernetes': {
      title: 'Kubernetes',
      summary: 'nodeها، podها، workloadها و warning eventهای clusterی که در workspace مربوط به Kubernetes انتخاب شده است.',
      whenToUse: [
        'می‌خواهید بدانید همهٔ nodeها Ready و podها در حال اجرا هستند یا نه.',
        'دنبال crash loop، OOM kill یا هشدارهای اخیر cluster هستید.',
      ],
      howItWorks: [
        'داده از Kubernetes collector می‌آید که cluster را از طریق context انتخاب‌شده در workspace مربوط به Kubernetes می‌خواند (به‌صورت پیش‌فرض هر ۳۰ ثانیه).',
        'نمایش CPU و memory هر pod و node به یک metrics-server در cluster نیاز دارد. بدون آن، یک بنر این را می‌گوید و آن خانه‌ها به‌جای تخمین زدن، خالی می‌مانند.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        { name: 'No cluster connected state (حالت بدون cluster متصل)', description: 'اگر هیچ context انتخاب نشده باشد، صفحه به‌جای داده عبارت "No cluster is connected" را نشان می‌دهد. یک context را در workspace مربوط به Kubernetes انتخاب کنید.' },
        {
          name: 'Stat cards (کارت‌های آماری)',
          description: 'چهار عدد کلیدی.',
          items: [
            { name: 'Nodes ready', description: 'nodeهای Ready از کل، و اینکه metricهای مصرف در دسترس هستند یا نه.' },
            { name: 'Pods', description: 'podهای در حال اجرا از کل، همراه با تعداد pending و failed.' },
            { name: 'Crash loops', description: 'podهایی که در restart شدن گیر کرده‌اند (CrashLoopBackOff). اگر بیشتر از صفر باشد قرمز می‌شود.' },
            { name: 'Warning events', description: 'تعداد warning eventهای اخیر در کل cluster. اگر بیشتر از صفر باشد نارنجی می‌شود.' },
          ],
        },
        { name: 'Nodes card (کارت Nodes)', description: 'هر node با Ready یا Not ready، IP داخلی، ظرفیت CPU بر حسب millicore، ظرفیت memory و یک نشان Pressure (اگر node فشار disk، memory یا PID گزارش کند، "pressure" با رنگ قرمز).' },
        {
          name: 'Pods card (کارت Pods)',
          description: 'هر pod با namespace، phase، node، restarts، CPU، memory و یک ستون Issue.',
          items: [{ name: 'Open Kubernetes', description: 'پیوندی به صفحهٔ Pods در workspace مربوط به Kubernetes که در آنجا می‌توانید روی podها اقدام کنید.' }],
        },
        { name: 'Workloads card (کارت Workloads)', description: 'Deploymentها، StatefulSetها و DaemonSetها با تعداد replicaهای ready/desired و یک نشان سلامت.' },
        { name: 'Warning events card (کارت Warning events)', description: 'آخرین هشدارها (تا ۵۰ مورد) با object، reason، namespace، پیام کوتاه‌شده و مدت زمان گذشته.' },
      ],
      tables: [
        {
          name: 'Pods table (جدول Pods)',
          columns: [
            { name: 'Pod', meaning: 'نام pod و namespace.', example: 'api-7d9f6 / prod' },
            { name: 'Phase', meaning: 'Running سبز است، Failed قرمز، و هر چیز دیگر (Pending، Unknown) نارنجی.', example: 'Running' },
            { name: 'Node', meaning: 'nodeای که pod روی آن اجرا می‌شود.', example: 'worker-2' },
            { name: 'Restarts', meaning: 'تعداد restart شدن containerها.', example: '12' },
            { name: 'CPU / Memory', meaning: 'مصرف اندازه‌گیری‌شده بر حسب millicore و بایت (به metrics-server نیاز دارد).', example: '120m / 256 MB' },
            { name: 'Issue', meaning: 'در صورت تشخیص، نشان CrashLoopBackOff یا OOMKilled، وگرنه خط تیره.', example: 'OOMKilled' },
          ],
        },
        {
          name: 'Workloads table (جدول Workloads)',
          columns: [
            { name: 'Ready', meaning: 'replicaهای ready از replicaهای desired.', example: '2/3' },
            { name: 'Health', meaning: 'Ready وقتی workload سالم است، وگرنه وضعیت آن مثل Degraded.', example: 'Degraded' },
          ],
        },
      ],
      example: {
        title: 'مثال: یک pod مدام restart می‌شود',
        steps: [
          'کارت "Crash loops" عدد ۱ را با رنگ قرمز نشان می‌دهد.',
          'در کارت Pods ردیفی را پیدا کنید که نشان CrashLoopBackOff و عدد Restarts بالایی دارد.',
          'کارت Warning events را برای همان object بخوانید، مثلاً "BackOff: restarting failed container".',
          'روی "Open Kubernetes" بزنید تا logهای pod را بخوانید.',
        ],
      },
      tips: [
        'اگر metrics-server نصب نباشد، ستون‌های CPU و memory خالی می‌مانند. این طبیعی است.',
        'این صفحه برای مانیتورینگ است. restart و scale کردن در workspace مربوط به Kubernetes انجام می‌شود.',
      ],
    },

    'observability/databases': {
      title: 'Databases (پایگاه‌های داده)',
      summary: 'تعداد اتصال‌ها، cache hit ratio، throughput و اندازهٔ اتصال‌های databaseای که قبلاً در workspace مربوط به Databases ساخته‌اید.',
      whenToUse: [
        'می‌خواهید با یک نگاه ببینید کدام databaseها در دسترس‌اند و چقدر مشغول‌اند.',
        'می‌خواهید اگر یک database از کار افتاد alert بگیرید.',
      ],
      howItWorks: [
        'database collector به‌صورت پیش‌فرض هر ۳۰ ثانیه metricهای engine را از طریق sessionهای موجود database می‌خواند. profileهای متصل را اندازه می‌گیرد، و اگر "Auto-connect saved database profiles" در Settings روشن باشد، profileهای ذخیره‌شده را هم.',
        'اینکه کدام metricها وجود دارند به engine بستگی دارد، پس بعضی خانه‌ها ممکن است خط تیره باشند.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        { name: 'Empty state (حالت خالی)', description: 'اگر هیچ اتصال مانیتورشده‌ای نباشد، صفحه توضیح می‌دهد که ابتدا باید یک database بسازید یا وصل کنید و یک دکمهٔ "Open Databases" پیشنهاد می‌دهد.' },
        {
          name: 'Stat cards (کارت‌های آماری)',
          description: 'دو کارت.',
          items: [
            { name: 'Monitored', description: 'profileهایی که metric آن‌ها اندازه‌گیری شده از کل profileهای بررسی‌شده.' },
            { name: 'Unreachable', description: 'profileهایی که تلاش برای اتصال آن‌ها شکست خورده است. اگر بیشتر از صفر باشد قرمز می‌شود.' },
          ],
        },
        {
          name: 'Connection metrics card (کارت Connection metrics)',
          description: 'یک ردیف برای هر اتصال database. دکمهٔ "Open Databases" به workspace مربوط به Databases می‌رود.',
        },
        { name: 'Auto-connect banner (بنر Auto-connect)', description: 'وقتی auto-connect روشن است نمایش داده می‌شود: collector برای profileهای ذخیره‌شده‌ای که متصل نیستند session باز می‌کند.' },
      ],
      tables: [
        {
          name: 'Connection metrics table (جدول Connection metrics)',
          columns: [
            { name: 'Database', meaning: 'نام profile و نام database.', example: 'orders-prod / orders' },
            { name: 'Engine', meaning: 'engine مربوط به database.', example: 'PostgreSQL' },
            { name: 'State', meaning: 'Measured (metricها خوانده شده‌اند)، Idle (متصل نیست و خوانشی وجود ندارد) یا Unreachable (اتصال شکست خورده).', example: 'Measured' },
            { name: 'Connections', meaning: 'اتصال‌های فعال، همراه با حداکثری که سرور اجازه می‌دهد.', example: '18 of 100' },
            { name: 'Cache hit', meaning: 'سهم خواندن‌هایی که از حافظه پاسخ داده شده‌اند. بیشتر بهتر است؛ در PostgreSQL کمتر از حدود ۹۵٪ اغلب یعنی حافظه کم است.', example: '99.2%' },
            { name: 'Ops/s', meaning: 'تعداد عملیات یا queryها در ثانیه.', example: '420' },
            { name: 'Size', meaning: 'اندازهٔ database روی disk.', example: '12.4 GB' },
            { name: 'Detail', meaning: 'پیام خطا وقتی چیزی شکست خورده باشد.', example: 'connection refused' },
          ],
        },
      ],
      example: {
        title: 'مثال: وقتی database از کار افتاد alert بگیرید',
        steps: [
          'database را در workspace مربوط به Databases وصل کنید.',
          'این صفحه را باز کنید و مطمئن شوید State آن Measured است.',
          'Alerts را باز کنید. قاعدهٔ پیش‌فرض "Database unavailable" وقتی فعال می‌شود که database.up به مدت ۶۰ ثانیه کمتر از ۱ بماند.',
          'یک notification channel اضافه کنید تا alert به شما برسد.',
        ],
      },
      tips: [
        'Idle به معنای خراب بودن نیست. فقط یعنی هیچ sessionای باز نیست. profile را وصل کنید یا auto-connect را فعال کنید.',
        'auto-connect با اعتبارنامه‌های ذخیره‌شده session باز می‌کند، پس آن را فقط برای databaseهایی فعال کنید که می‌خواهید مانیتور شوند.',
      ],
    },

    'observability/applications': {
      title: 'Applications (برنامه‌ها)',
      summary: 'نرخ درخواست، نرخ خطا و latency سرویس‌های خودتان، محاسبه‌شده از spanهای OpenTelemetry که برنامه‌های instrument‌شده به ingest receiver در OpsDeck می‌فرستند.',
      whenToUse: [
        'می‌خواهید بدانید کدام service کند است یا خطا می‌دهد.',
        'می‌خواهید latency از نوع p95 و p99 را برای هر service بدون محصول APM جداگانه ببینید.',
      ],
      howItWorks: [
        'serviceها فقط بعد از رسیدن spanها ظاهر می‌شوند. ingest receiver را در Settings فعال کنید، سپس از برنامه‌تان traceها را به‌صورت OTLP/HTTP JSON export کنید. هیچ‌چیز شبیه‌سازی نمی‌شود.',
        'آمار از spanهای بازهٔ تحلیل (حدود یک ساعت اخیر) محاسبه می‌شود. وقتی نرخ خطای یک service بیشتر از ۵٪ باشد، آن service وضعیت Degraded می‌گیرد.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        {
          name: 'Empty state and instrumentation guide (حالت خالی و راهنمای instrument کردن)',
          description: 'اگر هیچ spanای نرسیده باشد، صفحه "No application spans received" را نشان می‌دهد و، وقتی receiver فعال است، یک کارت "Instrument an application" با OTLP endpoint، آدرس traces exporter و protocol نمایش می‌دهد که آمادهٔ کپی کردن در تنظیمات OpenTelemetry شما هستند.',
        },
        {
          name: 'Stat cards (کارت‌های آماری)',
          description: 'سه مجموع.',
          items: [
            { name: 'Services', description: 'serviceهایی که در یک ساعت اخیر span گزارش کرده‌اند.' },
            { name: 'Spans', description: 'مجموع spanها در بازهٔ تحلیل.' },
            { name: 'Degraded', description: 'serviceهایی که نرخ خطایشان بیشتر از ۵٪ است.' },
          ],
        },
        { name: 'Services card (کارت Services)', description: 'یک ردیف برای هر service. زیر نام آن تا سه dependency پایین‌دستی فهرست می‌شود (مثلاً یک database یا service دیگری که فراخوانی می‌کند).' },
        { name: 'Instrumented operations card (کارت Instrumented operations)', description: 'تگ‌هایی مثل "checkout - POST /orders - 184 ms" که عملیات برتر هر service را با latency از نوع p95 نشان می‌دهند.' },
      ],
      tables: [
        {
          name: 'Services table (جدول Services)',
          columns: [
            { name: 'Service', meaning: 'نام service که از resource مربوط به span گرفته می‌شود، به‌اضافهٔ dependencyهایش.', example: 'checkout / postgres, redis' },
            { name: 'Health', meaning: 'Healthy، یا Degraded وقتی بیش از ۵٪ درخواست‌ها شکست خورده باشند.', example: 'Degraded' },
            { name: 'Req/min', meaning: 'تعداد درخواست در دقیقه.', example: '240' },
            { name: 'Errors', meaning: 'سهم spanهایی که با خطا تمام شده‌اند.', example: '7.50%' },
            { name: 'p50', meaning: 'latency میانه: نیمی از درخواست‌ها سریع‌تر از این بودند.', example: '42 ms' },
            { name: 'p95', meaning: '۹۵ درخواست از هر ۱۰۰ درخواست سریع‌تر از این بودند. تجربهٔ کاربرانی را نشان می‌دهد که کندتر جواب می‌گیرند.', example: '310 ms' },
            { name: 'p99', meaning: '۹۹ درخواست از هر ۱۰۰ درخواست سریع‌تر بودند. بدترین حالت‌ها را نشان می‌دهد.', example: '1,240 ms' },
            { name: 'Last seen', meaning: 'آخرین باری که service یک span فرستاده است.', example: '5 seconds ago' },
          ],
        },
      ],
      example: {
        title: 'مثال: خواندن وضعیت یک service کند',
        steps: [
          'ردیف "checkout" مقادیر p50 برابر 42 ms، p95 برابر 310 ms، p99 برابر 1,240 ms و Errors برابر 7.50% را نشان می‌دهد.',
          'median سریع است، اما از هر ۱۰۰ درخواست یکی بیش از یک ثانیه طول می‌کشد و ۷٫۵٪ شکست می‌خورند، پس service در وضعیت Degraded است.',
          'Traces را باز کنید، "Errors only" را تیک بزنید و checkout را انتخاب کنید تا درخواست‌های ناموفق را ببینید.',
        ],
      },
      tips: [
        'فقط OTLP روی HTTP با فرمت JSON پشتیبانی می‌شود. payloadهای Protobuf با HTTP 415 رد می‌شوند.',
        'اگر بعد از فعال کردن receiver هیچ serviceای نیامد، معمولاً یعنی برنامه هنوز traceها را export نکرده یا به URL یا port اشتباه اشاره می‌کند.',
      ],
    },

    'observability/synthetic': {
      title: 'Synthetic checks (بررسی‌های فعال)',
      summary: 'probeهای فعالی که وب‌سایت‌ها، portها، نام‌های DNS و گواهی‌های TLS شما را طبق زمان‌بندی از همین دستگاه آزمایش می‌کنند و ثبت می‌کنند که بالا هستند یا نه و با چه سرعتی پاسخ می‌دهند.',
      whenToUse: [
        'می‌خواهید بدانید یک وب‌سایت یا API کی از پاسخ دادن می‌افتد.',
        'می‌خواهید قبل از منقضی شدن یک گواهی TLS هشدار بگیرید.',
      ],
      howItWorks: [
        'هر check فعال از خود OpsDeck اجرا می‌شود (به‌صورت پیش‌فرض هر ۶۰ ثانیه برای هر check). هر نتیجه یک probe واقعی است: درخواست HTTP، اتصال TCP، DNS lookup یا TLS handshake.',
        'نتیجه‌ها به‌صورت metric ذخیره می‌شوند (synthetic.up، synthetic.response.ms، synthetic.certificate.days) که قاعده‌های alert پیش‌فرض و صفحهٔ Intelligence از آن‌ها استفاده می‌کنند.',
      ],
      parts: [
        HEADER,
        COLLECTOR_NOTE,
        {
          name: 'Stat cards (کارت‌های آماری)',
          description: 'Targets (کل، همراه با تعداد غیرفعال‌ها)، Up (checkهای موفق) و Down (checkهای ناموفق، اگر بیشتر از صفر باشد قرمز).',
        },
        {
          name: 'Checks card (کارت Checks)',
          description: 'همهٔ targetهای شما در یک جدول.',
          items: [
            { name: 'Add target', description: 'فرم را باز می‌کند. فیلدها: name؛ check type (HTTP(S)، TCP port، DNS record، TLS certificate)؛ URL؛ host؛ port؛ HTTP method؛ expected status codes (مثلاً 200,204)؛ DNS record type (A، AAAA، CNAME، MX، TXT)؛ متن "Response must contain"؛ نام و مقدار یک auth header؛ interval (از ۱۰ تا ۳۶۰۰ ثانیه)؛ timeout؛ group؛ environment؛ tags؛ note؛ "Run this check"؛ "Verify TLS certificates".' },
            { name: 'Test (row)', description: 'check را همین حالا یک بار اجرا می‌کند و زمان پاسخ و status code را نشان می‌دهد.' },
            { name: 'Edit (row)', description: 'تنظیمات check را تغییر می‌دهد.' },
            { name: 'Delete (row)', description: 'پس از تأیید، check و auth header ذخیره‌شدهٔ آن را حذف می‌کند.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Checks table (جدول Checks)',
          columns: [
            { name: 'Target', meaning: 'نام و URL یا host:port.', example: 'Checkout API / https://api.example.com/health' },
            { name: 'Kind', meaning: 'http، tcp، dns یا tls.', example: 'http' },
            { name: 'State', meaning: 'Up (سبز) وقتی check موفق بوده، Down (قرمز) وقتی شکست خورده، یا "skipped" وقتی غیرفعال است.', example: 'Up' },
            { name: 'Latency', meaning: 'probe چقدر طول کشیده است.', example: '128 ms' },
            { name: 'Status', meaning: 'HTTP status code برگشتی.', example: '200' },
            { name: 'Certificate', meaning: 'تعداد روزهای باقی‌مانده تا انقضای گواهی TLS.', example: '23 d' },
            { name: 'Detail', meaning: 'متن خطا برای checkی که شکست خورده است.', example: 'Expected status 200, got 503' },
          ],
        },
      ],
      example: {
        title: 'مثال: مانیتور کردن یک health endpoint و گرفتن اعلان',
        steps: [
          'روی "Add target" بزنید، نام آن را "Checkout API" بگذارید، HTTP(S) را نگه دارید، https://api.example.com/health و expected status 200 را وارد کنید.',
          'ذخیره کنید، سپس روی "Test" در ردیف بزنید. باید پیام "Target responded" را همراه با زمانی بر حسب میلی‌ثانیه ببینید.',
          'اگر endpoint به مدت ۲ دقیقه شکست بخورد، قاعدهٔ پیش‌فرض "Website or API unavailable" فعال می‌شود. مطمئن شوید در صفحهٔ Notifications یک channel دارید.',
        ],
      },
      tips: [
        'قاعدهٔ پیش‌فرض "TLS certificate expiring" وقتی کمتر از ۱۴ روز به انقضای گواهی مانده باشد هشدار می‌دهد.',
        'probeها از همین کامپیوتر شروع می‌شوند، پس چیزی را نشان می‌دهند که همین کامپیوتر می‌بیند، نه آنچه کاربران در شبکه‌های دیگر می‌بینند.',
        'از "Response must contain" استفاده کنید تا صفحه‌هایی را که 200 برمی‌گردانند اما متن خطا نشان می‌دهند شناسایی کنید.',
      ],
    },

    'observability/network': {
      title: 'Network (شبکه)',
      summary: 'بررسی‌های دسترس‌پذیری (ping، TCP، DNS) همراه با latency و packet loss، به‌علاوهٔ فهرست دستگاه‌های SNMP مثل switch و router.',
      whenToUse: [
        'می‌خواهید بدانید gateway، سرور DNS یا یک host دیگر در دسترس است یا نه و با چه سرعتی پاسخ می‌دهد.',
        'می‌خواهید uptime و تعداد interfaceهای یک switch یا router را ببینید.',
      ],
      howItWorks: [
        'checkها از همین دستگاه اجرا می‌شوند (به‌صورت پیش‌فرض هر ۶۰ ثانیه). latency و loss از probeهای واقعی می‌آیند. SNMP از نسخهٔ 2c استفاده می‌کند؛ community string در vault رمزگذاری‌شده ذخیره می‌شود.',
      ],
      parts: [
        HEADER,
        COLLECTOR_NOTE,
        { name: '"Measured, not estimated" banner (بنر اندازه‌گیری‌شده، نه تخمینی)', description: 'یادآوری اینکه مقادیر از probeهای فعال و شمارنده‌های واقعی interface می‌آیند.' },
        {
          name: 'Reachability checks card (کارت Reachability checks)',
          description: 'probeهای ICMP، TCP و DNS.',
          items: [
            { name: 'Add check', description: 'یک فرم باز می‌کند: name، kind (ping، tcp یا dns)، host، port (برای TCP)، probe count (از ۱ تا ۱۰)، timeout و enabled.' },
            { name: 'Delete (row)', description: 'پس از تأیید، probe کردن آن host را متوقف می‌کند.' },
          ],
        },
        {
          name: 'SNMP devices card (کارت SNMP devices)',
          description: 'دستگاه‌های شبکه که از طریق SNMP v2c خوانده می‌شوند.',
          items: [
            { name: 'Add device', description: 'یک فرم باز می‌کند: name، host، port، community (پنهان)، timeout و enabled.' },
            { name: 'Delete (row)', description: 'پس از تأیید، دستگاه و community string آن را حذف می‌کند.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Reachability checks table (جدول Reachability checks)',
          columns: [
            { name: 'Check', meaning: 'نام و host.', example: 'Gateway / 192.168.1.1' },
            { name: 'Kind', meaning: 'ping، tcp یا dns.', example: 'ping' },
            { name: 'State', meaning: 'Reachable (سبز) یا Failed (قرمز).', example: 'Reachable' },
            { name: 'Latency', meaning: 'میانگین زمان پاسخ.', example: '2 ms' },
            { name: 'Loss', meaning: 'سهم probeهایی که پاسخی نگرفتند. هر مقداری بالاتر از 0% روی یک لینک سیمی ارزش بررسی دارد.', example: '0.0%' },
            { name: 'Detail', meaning: 'متن خطا.', example: 'timeout' },
          ],
        },
        {
          name: 'SNMP devices table (جدول SNMP devices)',
          columns: [
            { name: 'Device', meaning: 'نام و host.', example: 'core-switch-1 / 10.0.0.2' },
            { name: 'Uptime', meaning: 'زمان گذشته از آخرین restart شدن دستگاه.', example: '34.5h' },
            { name: 'Interfaces', meaning: 'تعداد interfaceهایی که دستگاه گزارش می‌دهد.', example: '48' },
            { name: 'Detail', meaning: 'متن خطا، مثلاً community اشتباه.', example: 'timeout' },
          ],
        },
      ],
      example: {
        title: 'مثال: زیر نظر گرفتن اتصال اینترنت',
        steps: [
          'در Reachability checks روی "Add check" بزنید.',
          'نام آن را "Cloudflare DNS" بگذارید، kind را ping انتخاب کنید، host را 1.1.1.1 و probe count را 4 بگذارید و ذخیره کنید.',
          'بعد از یک دقیقه ردیف وضعیت Reachable، یک latency مثل 14 ms و Loss برابر 0.0% را نشان می‌دهد.',
        ],
      },
      tips: [
        'فقط SNMP v2c پشتیبانی می‌شود. community string یک گذرواژهٔ مشترک است، پس از یک community فقط‌خواندنی استفاده کنید.',
        'جزئیات شبکهٔ Docker و Kubernetes در صفحه‌های خودشان هستند. این صفحه دربارهٔ شبکهٔ محلی است.',
      ],
    },

    'observability/logs': {
      title: 'Logs (گزارش‌ها)',
      summary: 'یک ذخیره‌گاه قابل‌جست‌وجو از خط‌های log که از همین دستگاه، containerها، podهای Kubernetes و سرورهای راه دور جمع‌آوری شده‌اند، به‌علاوهٔ خط‌هایی که agentها ارسال می‌کنند.',
      whenToUse: [
        'می‌خواهید در چند منبع به‌طور هم‌زمان دنبال یک پیام بگردید.',
        'می‌خواهید خطاهای اخیر را در یک فایل CSV خروجی بگیرید.',
      ],
      howItWorks: [
        'logها به‌صورت زنده stream نمی‌شوند. شما با "Collect now" خط‌ها را به ذخیره‌گاه می‌کشید، یا agentها و OTLP exporterها آن‌ها را به ingest receiver می‌فرستند. ذخیره‌گاه یک فایل محلی فشرده است که با دسترسی فقط برای مالک نگهداری می‌شود.',
        'خط‌های قدیمی بعد از مدت نگهداری (retention، به‌صورت پیش‌فرض ۷ روز) یا وقتی به حداکثر تعداد رکورد (به‌صورت پیش‌فرض ۲۰٬۰۰۰) برسیم حذف می‌شوند. هر دو را می‌توانید در Settings تغییر دهید.',
        'جدول تا ۳۰۰ خط منطبق را نشان می‌دهد. این صفحه خودش را به‌روز نمی‌کند؛ از Refresh یا Apply filters استفاده کنید.',
      ],
      parts: [
        HEADER,
        {
          name: 'Stat cards (کارت‌های آماری)',
          description: 'Stored lines (همراه با روزهای retention)، Errors (تعداد خط‌های ERROR و FATAL)، Sources (چند منبع متفاوت وجود دارد) و Store size (اندازهٔ فایل، یا "in memory").',
        },
        {
          name: 'Search logs card - filters (کارت Search logs، فیلترها)',
          description: 'نوار ابزار اول تعیین می‌کند چه چیزی نمایش داده شود.',
          items: [
            { name: 'Search', description: 'متنی که باید در message، service یا trace id پیدا شود.' },
            { name: 'Level', description: 'All levels، TRACE، DEBUG، INFO، WARN، ERROR یا FATAL. با تغییر آن، فهرست بلافاصله دوباره بارگذاری می‌شود.' },
            { name: 'Source', description: 'All sources، یا یکی از منبع‌هایی که در ذخیره‌گاه وجود دارند (مثلاً local، docker، kubernetes، remote). با تغییر آن، فهرست بلافاصله دوباره بارگذاری می‌شود.' },
            { name: 'Apply filters', description: 'جست‌وجو را با متن تایپ‌شده اجرا می‌کند.' },
            { name: 'Clear stored logs', description: 'پس از تأیید، همهٔ خط‌های log ذخیره‌شده را حذف می‌کند. این کار قابل بازگشت نیست.' },
            { name: 'Export CSV', description: 'خط‌هایی را که با search، level و source فعلی مطابقت دارند در یک فایل CSV که انتخاب می‌کنید ذخیره می‌کند.' },
          ],
        },
        {
          name: 'Search logs card - Collect (کارت Search logs، جمع‌آوری)',
          description: 'نوار ابزار دوم خط‌های جدید را به ذخیره‌گاه می‌کشد.',
          items: [
            { name: 'Collect from', description: 'Local host (journalctl یا یک فایل log)، Docker container، Kubernetes pod یا Remote server.' },
            { name: 'Container, pod or server id', description: 'برای local اختیاری است. برای Docker نام یا id container را وارد کنید، برای Kubernetes مقدار namespace/pod را (مثلاً prod/api-7d9f6؛ اگر slash نباشد، namespace پیش‌فرض استفاده می‌شود)، و برای remote server مقدار server id آن را.' },
            { name: 'Collect now', description: 'خط‌های اخیر را از آن منبع می‌خواند. سپس یک بنر "Collection result" می‌گوید چند خط اضافه شده است.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Log lines table (جدول Log lines)',
          columns: [
            { name: 'Time', meaning: 'زمانی که خط log ثبت شده است.', example: '13 Nov 2026, 09:41:12' },
            { name: 'Level', meaning: 'شدت. ERROR و FATAL قرمز، WARN نارنجی و بقیه خاکستری‌اند.', example: 'ERROR' },
            { name: 'Source', meaning: 'خط از کجا آمده است.', example: 'docker' },
            { name: 'Service', meaning: 'نام service، container یا pod.', example: 'api-1' },
            { name: 'Message', meaning: 'متن log، کوتاه‌شده تا ۲۶۰ نویسه.', example: 'connect ECONNREFUSED 10.0.0.5:5432' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن دلیل خرابی container مربوط به API',
        steps: [
          '"Collect from" را روی Docker container بگذارید، نام container (api-1) را تایپ کنید و روی "Collect now" بزنید.',
          'بنر مثلاً می‌گوید "250 lines added from docker".',
          'Level را روی ERROR و Source را روی docker بگذارید، یا "ECONNREFUSED" را در Search تایپ کنید و روی "Apply filters" بزنید.',
          'روی "Export CSV" بزنید تا خط‌های منطبق را به همکارتان بدهید.',
        ],
      },
      tips: [
        'جمع‌آوری دوباره ممکن است خط‌هایی را که قبلاً دارید دوباره اضافه کند؛ برای تمرکز از فیلترهای time و level استفاده کنید.',
        'logها ممکن است شامل secretهایی باشند که برنامه‌ها چاپ کرده‌اند. با فایل‌های export‌شده با احتیاط رفتار کنید.',
        'خالی بودن جدول بعد از جمع‌آوری معمولاً یعنی منبع خروجی اخیری نداشته یا id اشتباه بوده؛ متن بنر را بخوانید.',
      ],
    },

    'observability/traces': {
      title: 'Traces (ردیابی‌ها)',
      summary: 'traceهای توزیع‌شده که از برنامه‌های instrument‌شده از طریق OTLP/HTTP JSON دریافت می‌شوند. trace مسیر کامل یک درخواست در میان serviceهاست و از spanها ساخته می‌شود.',
      whenToUse: [
        'یک درخواست کند است یا خطا می‌دهد و می‌خواهید ببینید کدام مرحله زمان را می‌گیرد.',
        'می‌خواهید ببینید کدام serviceها در یک درخواست شرکت دارند.',
      ],
      howItWorks: [
        'تا وقتی برنامه‌ای traceها را به ingest receiver export نکند، هیچ traceای وجود ندارد (receiver را در Settings فعال کنید؛ endpoint در صفحهٔ Agents & ingest نمایش داده می‌شود). فقط JSON پذیرفته می‌شود؛ protobuf با HTTP 415 رد می‌شود.',
        'spanها تا مدت retention (به‌صورت پیش‌فرض ۷ روز) و تا سقف تعداد span به‌صورت محلی ذخیره می‌شوند. این صفحه خودش را به‌روز نمی‌کند؛ از Refresh یا Apply استفاده کنید.',
      ],
      parts: [
        HEADER,
        { name: 'Stat cards (کارت‌های آماری)', description: 'Stored spans (همراه با روزهای retention)، Services (که در traceهای دریافتی دیده شده‌اند) و Traces in range (منطبق با فیلتر فعلی).' },
        {
          name: 'Filters card (کارت Filters)',
          description: 'انتخاب کنید کدام traceها فهرست شوند.',
          items: [
            { name: 'Service', description: 'All services یا یک service، همراه با تعداد spanهای آن. با تغییر آن، فهرست دوباره بارگذاری می‌شود.' },
            { name: 'Errors only', description: 'فقط traceهایی را نشان می‌دهد که دست‌کم یک span ناموفق دارند. با تغییر آن، فهرست دوباره بارگذاری می‌شود.' },
            { name: 'Apply', description: 'query را با فیلترهای فعلی دوباره اجرا می‌کند.' },
            { name: 'Clear stored traces', description: 'پس از تأیید، همهٔ spanهای ذخیره‌شده را حذف می‌کند. این کار قابل بازگشت نیست.' },
            { name: 'Ingest guide', description: 'صفحهٔ Agents & ingest را باز می‌کند، جایی که آدرس receiver و tokenهای agent نمایش داده می‌شوند.' },
          ],
        },
        { name: 'Traces card (کارت Traces)', description: 'فهرست traceها (تا ۱۰۰ مورد). برای باز کردن جزئیات، روی trace id کلیک کنید.' },
        {
          name: 'Trace detail card (کارت Trace detail)',
          description: 'بعد از کلیک روی یک trace id زیر فهرست ظاهر می‌شود. با "Close" آن را ببندید.',
          items: [
            { name: 'Summary', description: 'زمان شروع، مدت کل، تعداد spanها، تعداد خطاها و serviceهای درگیر.' },
            { name: 'Waterfall', description: 'یک ردیف برای هر span که بر اساس عمق تو رفتگی دارد (فراخوانی فرزند زیر parent خودش تو رفته است). نوار نشان می‌دهد span در کجای trace شروع شده و چقدر طول کشیده، و اگر span شکست خورده باشد قرمز می‌شود. مدت زمان کنار نوار نوشته می‌شود.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Traces table (جدول Traces)',
          columns: [
            { name: 'Trace', meaning: 'trace id (کوتاه‌شده). برای باز کردن جزئیات روی آن کلیک کنید.', example: '4bf92f3577b34da6...' },
            { name: 'Root span', meaning: 'نخستین عملیات درخواست و service آن.', example: 'POST /orders / checkout' },
            { name: 'Services', meaning: 'همهٔ serviceهایی که شرکت داشتند.', example: 'checkout, payments, postgres' },
            { name: 'Duration', meaning: 'کل زمان trace.', example: '842 ms' },
            { name: 'Spans', meaning: 'تعداد spanهای trace.', example: '17' },
            { name: 'Status', meaning: 'یک "ok" سبز یا یک نشان قرمز با تعداد خطاها.', example: '2 errors' },
            { name: 'When', meaning: 'چه مدت پیش ثبت شده است.', example: '3 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن مرحلهٔ کند یک درخواست سفارش',
        steps: [
          'در Service مقدار "checkout" را انتخاب کنید و روی "Apply" بزنید.',
          'دنبال traceای با Duration طولانی بگردید، مثلاً 842 ms، و روی id آن کلیک کنید.',
          'در waterfall طولانی‌ترین نوار را پیدا کنید. مثلاً "SELECT orders" از ۸۴۲ میلی‌ثانیه، ۷۰۰ میلی‌ثانیه را می‌گیرد، پس query مربوط به database گلوگاه است.',
          'Applications را باز کنید تا ببینید p95 آن service هم بالاست یا نه.',
        ],
      },
      tips: [
        'اگر درخواست از serviceای بدون instrumentation عبور کند، کار آن دیده نمی‌شود، پس این فاصله به‌صورت زمان parent بدون فرزند نمایش داده می‌شود.',
        'traceها ممکن است شامل URLها و مقدارهای attribute از برنامه‌های شما باشند؛ قبل از اشتراک‌گذاری دستگاه، ذخیره‌گاه را پاک کنید.',
      ],
    },

    'observability/alerts': {
      title: 'Alerts (هشدارها)',
      summary: 'alert ruleها یک metric را با یک آستانه مقایسه می‌کنند، alertها چیزی هستند که یک rule وقتی آستانه رد شود تولید می‌کند، و silenceها اعلان‌ها را برای مدتی بی‌صدا می‌کنند.',
      whenToUse: [
        'می‌خواهید ببینید همین الان چه چیزی مشکل دارد و آن را acknowledge یا resolve کنید.',
        'می‌خواهید وقتی CPU، disk، یک container، یک database یا یک وب‌سایت مشکل پیدا کرد باخبر شوید.',
        'در حال تعمیر و نگهداری هستید و می‌خواهید اعلان‌ها را بی‌صدا کنید.',
      ],
      howItWorks: [
        'ruleها هر چند ثانیه یک بار روی ذخیره‌گاه metric محلی ارزیابی می‌شوند. وقتی شرط یک rule برقرار شود، alert در وضعیت Pending قرار می‌گیرد. اگر شرط به اندازهٔ زمان "Pending for" ادامه پیدا کند، alert به Firing تبدیل می‌شود، اعلان‌ها به channelهای شما ارسال می‌شوند و (اگر rule چنین تنظیم شده باشد) یک incident باز یا به‌روز می‌شود. وقتی شرط به اندازهٔ زمان "Recovery for" پایان یافته باشد، alert به Resolved تبدیل می‌شود.',
        'OpsDeck با ruleهای پیش‌فرض عرضه می‌شود: CPU usage high، Memory usage high و Disk usage high (بیش از ۹۰٪ به مدت ۵ دقیقه)، Docker container unhealthy، Kubernetes pod crash loop، Kubernetes node not ready، Database unavailable، Website or API unavailable و TLS certificate expiring (کمتر از ۱۴ روز).',
        'این صفحه خودش را به‌روز نمی‌کند؛ از Refresh استفاده کنید.',
      ],
      parts: [
        HEADER,
        { name: 'Stat cards (کارت‌های آماری)', description: 'Active (firing یا pending، همراه با تعداد critical‌ها)، Rules (کل و فعال) و Silences (بی‌صداسازی‌های فعال).' },
        {
          name: 'Alerts card (کارت Alerts)',
          description: 'alertهای firing، pending و اخیراً resolved‌شده. برای راحتی، دکمهٔ "New rule" اینجا هم تکرار شده است.',
          items: [
            { name: 'Acknowledge (row)', description: 'ثبت می‌کند که alert را دیده‌اید. alert تا وقتی بهبود پیدا کند یا شما آن را resolve کنید فعال می‌ماند.' },
            { name: 'Resolve (row)', description: 'alert را دستی می‌بندد. فقط تا وقتی alert هنوز resolved نشده نمایش داده می‌شود.' },
          ],
        },
        {
          name: 'Rules card (کارت Rules)',
          description: 'همهٔ alert ruleها.',
          items: [
            { name: 'New rule', description: 'فرم rule را باز می‌کند. فیلدها: name؛ severity (info، warning، critical)؛ metric (مثلاً system.cpu.usage)؛ source filter؛ resource filter؛ aggregation (avg، max، min، sum، last، count، median، p90، p95، p99)؛ operator (>، >=، <، <=، ==، !=)؛ threshold؛ unit؛ pending-for seconds؛ lookback seconds؛ evaluate-every seconds؛ recovery threshold؛ recovery-for seconds؛ missing data (رد کردن ارزیابی یا فعال کردن alert)؛ label matcher مثل host=db-1,mount=/data؛ incident group key؛ description؛ "Enable this rule"؛ "Open an incident when firing".' },
            { name: 'Edit (row)', description: 'یک rule را تغییر می‌دهد، از جمله ruleهای پیش‌فرض را.' },
            { name: 'Delete (row)', description: 'پس از تأیید، rule را حذف می‌کند. alertهایی که قبلاً ایجاد کرده در history باقی می‌مانند.' },
          ],
        },
        {
          name: 'Silences card (کارت Silences)',
          description: 'بی‌صداسازی‌های فعال.',
          items: [
            { name: 'Create silence', description: 'فرمی را باز می‌کند با rule id (برای همهٔ ruleها خالی بگذارید)، reason (اجباری) و تاریخ و ساعت "Until" (پیش‌فرض یک ساعت بعد). alertها همچنان ارزیابی و ثبت می‌شوند، اما اعلان‌ها ارسال نمی‌شوند.' },
            { name: 'Remove (row)', description: 'silence را بلافاصله پایان می‌دهد.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Alerts table (جدول Alerts)',
          columns: [
            { name: 'Alert', meaning: 'نام rule و خلاصهٔ کوتاهی از آنچه مشاهده شده است.', example: 'CPU usage high - system.cpu.usage > 90.0% (observed 94.3)' },
            { name: 'Severity', meaning: 'critical (قرمز)، warning (نارنجی) یا info (آبی).', example: 'warning' },
            { name: 'State', meaning: 'pending (شرط برقرار است اما هنوز به اندازهٔ کافی ادامه نداشته)، firing (مشکل تأییدشده)، resolved (بهبود یافته).', example: 'firing' },
            { name: 'Resource', meaning: 'alert دربارهٔ چه چیزی است.', example: 'docker:api' },
            { name: 'Value', meaning: 'آخرین مقدار مشاهده‌شده و آستانهٔ rule.', example: '94.3%, threshold 90.0%' },
            { name: 'Started', meaning: 'alert از چه زمانی شروع شده است.', example: '12 minutes ago' },
          ],
        },
        {
          name: 'Rules table (جدول Rules)',
          columns: [
            { name: 'Rule', meaning: 'نام و شرط به شکل خلاصه.', example: 'system.cpu.usage avg > 90 percent' },
            { name: 'Severity', meaning: 'جدی بودن alert در حالت firing.', example: 'warning' },
            { name: 'Enabled', meaning: 'rule ارزیابی می‌شود یا نه.', example: 'enabled' },
            { name: 'Lookback', meaning: 'برای aggregation، نمونه‌ها از چه مدت قبل گرفته می‌شوند.', example: '300s lookback' },
            { name: 'For', meaning: 'شرط باید چه مدت برقرار بماند تا alert فعال شود.', example: '300s for' },
          ],
        },
      ],
      example: {
        title: 'مثال: وقتی یک container به حالت unhealthy رفت alert بگیرید',
        steps: [
          'کارت Rules را بررسی کنید. rule پیش‌فرض "Docker container unhealthy" از قبل وجود دارد: docker.containers.unhealthy max > 0 به مدت ۶۰ ثانیه، با severity برابر critical.',
          'اگر آستانهٔ دیگری می‌خواهید، روی Edit بزنید و مقدارها را تغییر دهید، یا با "New rule" ruleای مخصوص خودتان بسازید.',
          'Notifications را باز کنید و یک channel اضافه کنید، سپس با "Send test" مطمئن شوید کار می‌کند.',
          'وقتی یک container به مدت ۶۰ ثانیه unhealthy بماند، alert از pending به firing می‌رود، پیامی دریافت می‌کنید و یک incident باز می‌شود.',
        ],
      },
      tips: [
        'از "Pending for" استفاده کنید تا از نویز جهش‌های کوتاه جلوگیری شود: زمان pending برابر ۵ دقیقه یک جهش CPU به مدت ۳۰ ثانیه را نادیده می‌گیرد.',
        'silenceها جلوی ثبت شدن alertها را نمی‌گیرند. فقط اعلان‌ها را بی‌صدا می‌کنند.',
        'اگر metricها وجود نداشته باشند، گزینهٔ پیش‌فرض "Skip evaluation" هیچ کاری نمی‌کند. "Fire the alert" را فقط وقتی انتخاب کنید که خودِ سکوت مشکل است (مثلاً یک heartbeat).',
        'Acknowledge کردن چیزی را درست نمی‌کند. فقط به تیمتان خبر می‌دهد که کسی مشغول رسیدگی است.',
      ],
    },
  });
})();
