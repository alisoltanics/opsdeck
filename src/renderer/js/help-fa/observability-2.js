'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.helpFa = OD.helpFa || {};

  const HEADER = {
    name: 'Page header (سربرگ صفحه)',
    description: 'هر صفحهٔ Observability با یک عنوان، یک توضیح یک‌خطی و چند دکمهٔ ثابت در سمت راست شروع می‌شود.',
    items: [
      { name: 'Refresh', description: 'صفحه را دوباره از سرویس پایش می‌خواند و پیام "Refreshed" را نشان می‌دهد. صفحه‌هایی که بازخوانی خودکار ۳۰ ثانیه‌ای ندارند (مثل logs، traces، alerts، settings و چند صفحهٔ دیگر) فقط وقتی به‌روز می‌شوند که روی این دکمه کلیک کنید یا فیلتری را عوض کنید.' },
      { name: 'Ask AI', description: 'دستیار هوش مصنوعی را با صفحهٔ فعلی Observability به‌عنوان زمینه باز می‌کند تا دربارهٔ چیزی که می‌بینید سؤال بپرسید. دستیار هرگز خودش remediation اجرا نمی‌کند.' },
    ],
  };
  const RANGE = {
    name: 'Range selector (انتخاب بازهٔ زمانی)',
    description: 'منوی کشویی در سربرگ با گزینه‌های Last 15 minutes، Last hour، Last 6 hours، Last 24 hours، Last 7 days و Last 30 days. این گزینه بازهٔ زمانی نمودارها و روندها را تعیین می‌کند. انتخاب شما بین صفحه‌هایی که این منو را دارند مشترک است (Overview، Docker، Kubernetes، Databases، Applications، Metrics explorer و Dashboards).',
  };

  Object.assign(OD.helpFa, {
    'observability/deployments': {
      title: 'Deployments (استقرارها)',
      summary: 'یک خط زمانی از rolloutها که از ReplicaSetهای Kubernetes و زمان ساخت کانتینرهای Docker خوانده می‌شود تا بتوانید یک مشکل را با تغییری که قبل از آن رخ داده مرتبط کنید.',
      whenToUse: [
        'چیزی خراب شده و می‌خواهید بدانید درست قبل از آن چه چیزی deploy شده است.',
        'می‌خواهید ببینید در ۲۴ ساعت گذشته چند rollout انجام شده است.',
      ],
      howItWorks: [
        'وقتی صفحه را باز یا refresh می‌کنید، شواهد rollout از کلاستر و موتور Docker خوانده می‌شود. هیچ رویدادی ساختگی نیست. در بخش Kubernetes، ReplicaSetهای نگه‌داری‌شده نمایش داده می‌شوند (هر revision از ReplicaSet یک rollout است) و در بخش Docker زمان ساخت هر کانتینر دیده می‌شود.',
        'اگر یکی از منبع‌ها خطا بدهد، یک بنر "Partial coverage" نام آن را می‌گوید و منبع دیگر همچنان نمایش داده می‌شود. فهرست "How to read this" در پایین صفحه محدودیت‌های شواهد را توضیح می‌دهد.',
      ],
      parts: [
        HEADER,
        {
          name: 'Stat cards (کارت‌های آمار)',
          description: 'شامل Deployment records (مجموع و تعداد موجود در نمای فعلی)، Kubernetes rollouts، Docker creations و Last 24 hours (همراه با تعداد مواردی که هنوز در حال progressing هستند).',
        },
        {
          name: 'Deployment timeline card (کارت خط زمانی استقرار)',
          description: 'فهرست رکوردهای استقرار.',
          items: [
            { name: 'Filter box', description: 'با تایپ کردن، فهرست را زنده بر اساس workload، image، namespace، version، state، context یا change cause فیلتر می‌کند.' },
            { name: 'Source drop-down', description: 'گزینه‌های All sources، Kubernetes یا Docker.' },
            { name: 'Counter', description: 'برای فیلتر فعلی عبارت "N of M record(s)" را نشان می‌دهد.' },
            { name: 'Kubernetes deployments / Containers (header links)', description: 'صفحه‌های متناظر را در بخش‌های Kubernetes و Docker باز می‌کنند.' },
            { name: 'Open (row)', description: 'workload یا کانتینر را در بخش مخصوص خودش باز می‌کند.' },
          ],
        },
        { name: 'How to read this', description: 'فهرست کوتاهی از محدودیت‌های شناخته‌شدهٔ شواهد که در صورت وجود نمایش داده می‌شود.' },
      ],
      tables: [
        {
          name: 'Deployment timeline table (جدول خط زمانی استقرار)',
          columns: [
            { name: 'When', meaning: 'تاریخ و ساعت rollout و مدت زمانی که از آن گذشته است.', example: '13 Nov 2026, 08:15 / 1 hour ago' },
            { name: 'Source', meaning: 'Kubernetes (آبی) یا Docker (بنفش).', example: 'Kubernetes' },
            { name: 'Workload', meaning: 'نام، نوع (kind) و namespace.', example: 'api / Deployment / prod' },
            { name: 'Image / revision', meaning: 'image کانتینر و، برای Kubernetes، شمارهٔ revision.', example: 'registry.example.com/api:1.8.2, revision 14' },
            { name: 'State', meaning: 'active یا running (سبز)، progressing (نارنجی)، superseded یا exited یا stopped (خاکستری)، created (آبی).', example: 'active' },
            { name: 'Detail', meaning: 'متن اضافی مثل change cause.', example: 'kubectl set image' },
          ],
        },
      ],
      example: {
        title: 'مثال: ارتباط دادن جهش خطا با یک release',
        steps: [
          'یک alert برای سرویس "checkout" از ساعت 08:20 شروع شده است.',
          'صفحهٔ Deployments را باز کنید و در Filter box عبارت "checkout" را تایپ کنید.',
          'ردیفی در ساعت 08:15 revision 14 را با image tag برابر 1.8.2 و state برابر active نشان می‌دهد و revision قبلی superseded است.',
          'از همان ردیف، workload را باز کنید تا rollback انجام دهید یا logها را بخوانید.',
        ],
      },
      tips: [
        'Kubernetes فقط تعداد محدودی ReplicaSet قدیمی را نگه می‌دارد، بنابراین rolloutهای خیلی قدیمی نمایش داده نمی‌شوند.',
        'زمان ساخت در Docker یعنی کانتینر در آن لحظه ساخته شده است، که همیشه به معنای یک release جدید نیست.',
      ],
    },

    'observability/incidents': {
      title: 'Incidents (حادثه‌ها)',
      summary: 'Incident چند alert مرتبط را در یک پرونده جمع می‌کند که status، مسئول و خط زمانی دارد، تا تیم بتواند یک مشکل را از تشخیص تا رفع دنبال کند.',
      whenToUse: [
        'یک alert فعال شده و می‌خواهید پیگیری کنید چه کسی آن را رسیدگی می‌کند و چه چیزی پیدا شده است.',
        'مشکلی دیده‌اید که پایش آن را تشخیص نداده و می‌خواهید آن را ثبت کنید.',
      ],
      howItWorks: [
        'وقتی alertی از یک rule که گزینهٔ "Open an incident when firing" را دارد فعال (fire) شود، OpsDeck یک incident باز می‌کند، یا alert را به incident بازِ موجودی با همان group key اضافه می‌کند (به‌طور پیش‌فرض rule و resource). وقتی همهٔ alertهای متصل به حالت عادی برگردند، incident خودکار resolved می‌شود و یک مورد در timeline ثبت می‌شود.',
        'Status این مراحل را طی می‌کند: open، acknowledged، mitigated و resolved. هر تغییر یک مورد به timeline اضافه می‌کند.',
        'این صفحه خودش refresh نمی‌شود؛ از Refresh استفاده کنید.',
      ],
      parts: [
        HEADER,
        { name: 'Stat cards (کارت‌های آمار)', description: 'Open (حل‌نشده)، Critical (incidentهای critical باز) و Total retained (مجموع نگه‌داری‌شده).' },
        {
          name: 'Incidents card (کارت حادثه‌ها)',
          description: 'فهرست incidentها.',
          items: [
            { name: 'Create incident', description: 'فرمی با title (الزامی)، severity، assignee و summary باز می‌کند، برای مشکل‌هایی که پایش شما آن‌ها را اعلام نکرده است.' },
            { name: 'Update (row)', description: 'فرمی برای status (open، acknowledged، mitigated، resolved)، severity، assignee، root cause، resolution و یک یادداشت timeline باز می‌کند. برای incidentهای resolved مخفی است.' },
            { name: 'View (row)', description: 'کارت جزئیات را زیر جدول باز می‌کند.' },
          ],
        },
        {
          name: 'Incident detail card (کارت جزئیات حادثه)',
          description: 'خلاصه، assignee، root cause، resolution و زمان ایجاد را نشان می‌دهد و بعد timeline را: هر مورد یک زمان، یک نوع (مثلاً status یا note) و یک متن دارد. "Close" کارت را مخفی می‌کند.',
        },
      ],
      tables: [
        {
          name: 'Incidents table (جدول حادثه‌ها)',
          columns: [
            { name: 'Incident', meaning: 'عنوان و یک خلاصهٔ کوتاه.', example: 'Website or API unavailable - Checkout API' },
            { name: 'Severity', meaning: 'critical، warning یا info.', example: 'critical' },
            { name: 'Status', meaning: 'open (نارنجی)، acknowledged (آبی) یا resolved (سبز)؛ حالت mitigated هم ممکن است.', example: 'acknowledged' },
            { name: 'Assignee', meaning: 'مسئول آن، یا "Unassigned".', example: 'Sara' },
            { name: 'Alerts', meaning: 'تعداد alertهایی که در incident گروه شده‌اند.', example: '3' },
            { name: 'Updated', meaning: 'مدت زمان از آخرین تغییر.', example: '4 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'مثال: رسیدگی به یک incident از ابتدا تا انتها',
        steps: [
          'یک incident از نوع critical با عنوان "Database unavailable" و status برابر open ظاهر می‌شود. روی "Update" کلیک کنید، assignee را روی خودتان و status را روی acknowledged بگذارید.',
          'بعد از restart کردن سرویس، status را روی mitigated بگذارید و علت را در "Root cause" بنویسید، مثلاً "Disk full on db-1".',
          'وقتی همه‌چیز عادی شد، status را روی resolved بگذارید و "Resolution" را پر کنید. با "View" می‌توانید timeline ساخته‌شده را مرور کنید.',
        ],
      },
      tips: [
        'root cause و resolution را تا وقتی تازه است بنویسید؛ timeline مرجع شما برای بازبینی‌های بعدی است.',
        'incidentهای resolved دکمهٔ Update ندارند. اگر مشکل برگشت، یک incident جدید بسازید.',
      ],
    },

    'observability/dashboards': {
      title: 'Dashboards (داشبوردها)',
      summary: 'مجموعه‌هایی از نمودار و جدول ("widget") که از metricهای ذخیره‌شده ساخته می‌شوند. داشبوردهای آماده شامل infrastructure، Docker، Kubernetes، databases، API و logs هستند و می‌توانید داشبورد خودتان را هم بسازید.',
      whenToUse: [
        'یک نمای آمادهٔ یک حوزه، مثلاً Docker، می‌خواهید.',
        'یک صفحهٔ دلخواه فقط با metricهایی که برایتان مهم است می‌خواهید.',
      ],
      howItWorks: [
        'widgetها metricها را از time-series store محلی برای بازهٔ انتخاب‌شده می‌خوانند. widget فقط داده‌ای را نشان می‌دهد که collectorها واقعاً ثبت کرده‌اند؛ اگر نمونه‌ای نباشد عبارت "No data yet" را می‌بینید.',
        'داشبوردهای Built in فقط‌خواندنی هستند. برای تغییر یکی از آن‌ها، آن را duplicate کنید و نسخهٔ کپی را ویرایش کنید.',
        'با تغییر range یا کلیک روی Refresh، داشبورد دوباره خوانده می‌شود.',
      ],
      parts: [
        HEADER,
        RANGE,
        {
          name: 'Dashboard list (left) (فهرست داشبوردها، سمت چپ)',
          description: 'همهٔ داشبوردها، هرکدام با نام، برچسب "Built in" یا "Custom" و تعداد widgetها. داشبورد فعال هایلایت می‌شود.',
          items: [{ name: 'New', description: 'فرمی با name (الزامی)، description و icon باز می‌کند و یک داشبورد custom خالی می‌سازد که بلافاصله باز می‌شود.' }],
        },
        {
          name: 'Dashboard header (سربرگ داشبورد)',
          description: 'نام و توضیح داشبورد باز، همراه با اقدام‌های آن.',
          items: [
            { name: 'Favorite / Unfavorite', description: 'داشبورد را به‌عنوان مورد علاقه علامت می‌زند.' },
            { name: 'Duplicate', description: 'یک کپی قابل‌ویرایش می‌سازد؛ راه شخصی‌سازی داشبورد Built in همین است.' },
            { name: 'Add widget', description: 'فقط برای داشبوردهای custom. فرم widget را باز می‌کند: title، visualisation (timeseries، area، bar، pie، gauge، stat، table، topn، heatmap، status، latency)، metric (از metricهای ثبت‌شده انتخاب می‌شود)، unit، aggregation (avg، max، min، sum، last)، عرض بر حسب ستون‌های شبکه (۱ تا ۱۲) و ارتفاع بر حسب پیکسل (۱۲۰ تا ۶۰۰).' },
            { name: 'Delete', description: 'فقط برای داشبوردهای custom. پس از تأیید، داشبورد را حذف می‌کند. داشبوردهای Built in قابل حذف نیستند.' },
          ],
        },
        {
          name: 'Widgets',
          description: 'هر widget یک کارت با عنوان و نام metric است. سری‌های زمانی یک نمودار area نشان می‌دهند و فهرست‌ها یک جدول (مثلاً خطوط log یا مقادیر top-N). widgetهای داشبوردهای custom دکمه‌های Edit و Delete دارند؛ Delete تأیید می‌خواهد.',
        },
      ],
      example: {
        title: 'مثال: ساخت داشبورد "Payments service"',
        steps: [
          'در فهرست داشبوردها روی "New" کلیک کنید، نام "Payments service" را بدهید و آن را بسازید.',
          'روی "Add widget" کلیک کنید. Title را "Checkout p95"، visualisation را timeseries، metric را application.response.p95_ms، unit را milliseconds، aggregation را max و width را 6 بگذارید.',
          'widget دوم را برای application.error_rate با unit برابر percent اضافه کنید.',
          'range را روی Last 24 hours بگذارید تا روند یک روز کامل را ببینید.',
        ],
      },
      tips: [
        'فهرست metric در فرم widget فقط metricهای ثبت‌شده را دارد؛ پس اول صبر کنید collector یا ingest داده برساند.',
        'مجموع عرض widgetها در یک ردیف باید ۱۲ ستون شود.',
        'برای بررسی یک metric بدون ذخیره کردن چیزی، از Metrics explorer استفاده کنید.',
      ],
    },

    'observability/metrics': {
      title: 'Metrics explorer (جستجوگر metric)',
      summary: 'همهٔ metricهایی را که OpsDeck ذخیره کرده مرور کنید، نمودار و seriesهای پشت آن را ببینید و نمونه‌ها را به CSV خروجی بگیرید.',
      whenToUse: [
        'می‌خواهید قبل از نوشتن alert rule یا widget داشبورد بدانید چه نام‌های metric وجود دارد.',
        'می‌خواهید مقادیر خام پشت یک نمودار را بررسی کنید.',
      ],
      howItWorks: [
        'Catalog همهٔ metricهایی را که فعلاً نگه‌داری می‌شوند فهرست می‌کند (نام‌هایی مثل system.cpu.usage، docker.containers.running، synthetic.up، application.error_rate). نمونه‌های خام ۲۴ ساعت نگه‌داری می‌شوند و بعد به aggregate تبدیل می‌شوند که به‌طور پیش‌فرض ۳۰ روز می‌مانند.',
        'یک metric می‌تواند چند series داشته باشد، مثلاً یکی برای هر mount point یا هر کانتینر، که با labelها از هم جدا می‌شوند.',
      ],
      parts: [
        HEADER,
        RANGE,
        {
          name: 'Catalog card (کارت فهرست metricها)',
          description: 'جستجو و انتخاب یک metric.',
          items: [
            { name: 'Search metrics', description: 'فهرست metricها را بر اساس نام محدود می‌کند، مثلاً "docker." یا "system.cpu".' },
            { name: 'Metric', description: 'منوی کشویی metricهای منطبق (تا ۲۰۰ مورد). با تغییر آن، metric بلافاصله بارگذاری می‌شود.' },
            { name: 'Query', description: 'متن جستجو و metric انتخاب‌شده را اعمال می‌کند و دوباره بارگذاری می‌کند.' },
            { name: 'Export CSV', description: 'نمونه‌های metric انتخاب‌شده را برای range فعلی در یک فایل CSV ذخیره می‌کند.' },
            { name: 'Counts line', description: 'نشان می‌دهد چند metric و چند series ذخیره‌شده وجود دارد.' },
          ],
        },
        {
          name: 'Result card (کارت نتیجه)',
          description: 'عنوانش نام metric است و زیرعنوانی مثل "3 series - avg over 1h" دارد. یک نمودار area از series اول و یک جدول از seriesها (تا ۳۰ مورد) دارد. اگر metricی انتخاب نشده باشد، عبارت "No metric selected" را می‌بینید.',
        },
      ],
      tables: [
        {
          name: 'Series table (جدول seriesها)',
          columns: [
            { name: 'Metric', meaning: 'نام metric.', example: 'system.disk.usage' },
            { name: 'Source', meaning: 'کدام collector آن را تولید کرده است.', example: 'local' },
            { name: 'Resource', meaning: 'چیزی که اندازه‌گیری شده.', example: 'host' },
            { name: 'Labels', meaning: 'بُعدهای اضافه به‌صورت JSON که seriesها را از هم متمایز می‌کنند.', example: '{"mount":"/data"}' },
            { name: 'Latest', meaning: 'آخرین مقدار، با قالب واحد آن.', example: '71.3%' },
            { name: 'Points', meaning: 'تعداد نمونه‌ها در range.', example: '360' },
          ],
        },
      ],
      example: {
        title: 'مثال: انتخاب metric مناسب برای یک alert rule',
        steps: [
          'در Search metrics عبارت "disk" را تایپ کنید و در Metric گزینهٔ system.disk.usage را انتخاب کنید.',
          'روی "Query" کلیک کنید. جدول برای هر mount point یک series را با آخرین درصد نشان می‌دهد.',
          'نام metric را کپی کنید و در "New rule" در صفحهٔ Alerts، با aggregation برابر max و threshold برابر 90 به کار ببرید.',
        ],
      },
      tips: [
        'در نمودار فقط series اول رسم می‌شود. برای دیدن بقیه از جدول استفاده کنید.',
        'range کوتاه جزئیات بیشتری دارد؛ range بلند از aggregateها استفاده می‌کند.',
      ],
    },

    'observability/reports': {
      title: 'Reports (گزارش‌ها)',
      summary: 'از داده‌های پایش نگه‌داری‌شده یک گزارش لحظه‌ای می‌سازد و اجازه می‌دهد آن را پیش‌نمایش کنید و به‌صورت JSON، CSV یا PDF ذخیره کنید.',
      whenToUse: [
        'برای یک بازبینی هفتگی، ممیزی یا مشتری به یک سند نیاز دارید.',
        'داده‌های یک بازهٔ گذشته (تا ۳۰ روز) را می‌خواهید.',
      ],
      howItWorks: [
        'گزارش در لحظهٔ درخواست از داده‌های ذخیره‌شدهٔ محلی ساخته می‌شود؛ زمان‌بندی در کار نیست و چیزی به جایی ارسال نمی‌شود. JSON و CSV در پیش‌نمایش به‌صورت متن نشان داده می‌شوند؛ برای PDF پیش‌نمایش فقط نام و حجم فایل را نشان می‌دهد.',
      ],
      parts: [
        HEADER,
        {
          name: 'Generate a report card (کارت ساخت گزارش)',
          description: 'انتخاب کنید چه چیزی ساخته شود.',
          items: [
            { name: 'Report', description: 'یکی از این‌ها: System performance، Server availability، Docker resource utilization، Kubernetes cluster health، Database performance، API availability، Application performance، Alert history، Incident history.' },
            { name: 'Format', description: 'JSON، CSV یا PDF.' },
            { name: 'Range', description: '1h، 24h، 7d (پیش‌فرض) یا 30d.' },
            { name: 'Generate', description: 'گزارش را می‌سازد و در کارت Preview نشان می‌دهد.' },
            { name: 'Save to file', description: 'بعد از ساخته شدن گزارش ظاهر می‌شود. یک پنجرهٔ ذخیره باز می‌کند تا فایل نوشته شود.' },
          ],
        },
        { name: 'Preview card (کارت پیش‌نمایش)', description: 'متن گزارش (تا ۱۲٬۰۰۰ نویسه) یا، برای PDF، کادری با نام و حجم فایل. قبل از اولین گزارش، یک صفحهٔ خالی از شما می‌خواهد گزارش و format را انتخاب کنید.' },
      ],
      example: {
        title: 'مثال: گزارش هفتگی Docker به‌صورت PDF',
        steps: [
          '"Docker resource utilization" را انتخاب کنید، format را PDF و range را 7d بگذارید.',
          'روی "Generate" کلیک کنید. پیش‌نمایش عبارت "PDF generated" را همراه با حجم فایل نشان می‌دهد.',
          'روی "Save to file" کلیک کنید و محل ذخیره را انتخاب کنید.',
        ],
      },
      tips: [
        'گزارش‌ها فقط همان retention‌ای را پوشش می‌دهند که دارید. اگر تاریخچهٔ طولانی‌تری لازم است، retention را در Settings افزایش دهید.',
        'گزارش‌های alert و incident metric ندارند، بلکه تاریخچه را فهرست می‌کنند.',
      ],
    },

    'observability/insights': {
      title: 'Intelligence (Observability) (تحلیل هوشمند)',
      summary: 'یک تحلیل فقط‌خواندنی از telemetry نگه‌داری‌شده: هدف‌های سرویس و error budget، anomalyها، پیش‌بینی ظرفیت، وابستگی‌های سرویس‌ها و پروفایل latency، به‌علاوهٔ فهرستی از findings که به توجه نیاز دارند.',
      whenToUse: [
        'می‌خواهید یک هدف پایداری مثل 99.9% availability تعریف کنید و ببینید به آن می‌رسید یا نه.',
        'می‌خواهید بدانید یک metric رفتار غیرعادی دارد یا چه زمانی دیسک پر می‌شود.',
        'می‌خواهید ببینید سرویس‌های شما چطور یکدیگر را صدا می‌زنند.',
      ],
      howItWorks: [
        'تحلیل در main process روی نمونه‌ها و spanهای نگه‌داری‌شده اجرا می‌شود. مقادیری که قابل اندازه‌گیری نبودند به‌صورت unknown گزارش می‌شوند یا زیر Limitations می‌آیند و هرگز healthy حساب نمی‌شوند. بدون داده‌ٔ کافی هیچ چیزی تخمین زده نمی‌شود.',
        'صفحه هنگام باز شدن یک بار تحلیل می‌کند و بعد هر ۹۰ ثانیه در پس‌زمینه refresh می‌شود (فرمی را که در حال تایپ آن هستید مختل نمی‌کند). برای به‌روزرسانی فوری از Refresh استفاده کنید. در پایین صفحه عبارت "Analysed ... read-only snapshot" دیده می‌شود.',
        'تنها چیزی که اینجا می‌توانید تغییر دهید فهرست هدف‌های سرویس (service objectives) است که در تنظیمات مشترک intelligence ذخیره می‌شود.',
      ],
      parts: [
        {
          name: 'Page header (سربرگ صفحه)',
          description: 'عنوان، یک توضیح کوتاه و دو دکمه.',
          items: [
            { name: 'Cross-module view', description: 'نمای کلی Intelligence را که همهٔ workspaceها را ترکیب می‌کند باز می‌کند.' },
            { name: 'Refresh', description: 'تحلیل را همین حالا دوباره اجرا می‌کند.' },
          ],
        },
        {
          name: 'Stat cards (کارت‌های آمار)',
          description: 'چهار کارت.',
          items: [
            { name: 'Objectives', description: 'تعداد هدف‌هایی که اندازه‌گیری می‌شوند. اگر یکی نقض شده باشد قرمز می‌شود.' },
            { name: 'Anomalies (24h)', description: 'مقادیر غیرعادی که در یک روز گذشته پیدا شده‌اند و تعداد seriesهای بررسی‌شده.' },
            { name: 'Capacity series', description: 'تعداد seriesهایی که پیش‌بینی هفت‌روزه دارند.' },
            { name: 'Service edges', description: 'تعداد ارتباط‌های caller به callee بین سرویس‌ها، همراه با تعداد سرویس‌ها و spanها.' },
          ],
        },
        { name: 'Findings card (کارت یافته‌ها)', description: 'مواردی که از یک rule عبور کرده‌اند: SLO burn، anomalyها، عبور از ظرفیت و وابستگی‌های دارای خطا. هر مورد یک badge برای severity (critical، warning، info، pass، unknown)، یک title، جزئیات و evidence دارد و یک دکمهٔ Open به صفحهٔ مرتبط. chipهای بالای کارت تعداد findings را به تفکیک severity نشان می‌دهند.' },
        { name: 'Service objectives card (کارت هدف‌های سرویس)', description: 'نتیجهٔ هر هدف. جدول زیر را ببینید.' },
        {
          name: 'Objective definitions card (کارت تعریف هدف‌ها)',
          description: 'هدف‌های شما، همراه با فرم افزودن.',
          items: [
            { name: 'Definitions list', description: 'نام، metric، "Good when" (حداقل یا حداکثر برابر threshold)، target، window، state و دکمهٔ Delete (بعد از تأیید؛ هیچ داده‌ٔ metric حذف نمی‌شود).' },
            { name: 'Add objective form', description: 'Name، Metric (مثلاً synthetic.up)، Comparison ("At least the threshold is good" یا "At most the threshold is good")، Threshold، Target % (۰ تا ۱۰۰)، Window بر حسب ساعت (۱ تا ۷۲۰) و Aggregation (avg، max، min، last). "Add objective" آن را ذخیره می‌کند. نام‌ها باید یکتا باشند و حداکثر ۵۰ هدف مجاز است.' },
          ],
        },
        { name: 'Anomalies card (کارت anomalyها)', description: 'مقادیری که به‌شدت از median نمونه‌های اخیر فاصله دارند، همراه با جهت و امتیاز بر حسب sigma.' },
        { name: 'Capacity forecast card (کارت پیش‌بینی ظرفیت)', description: 'یک روند خطی از منابعی مثل مصرف دیسک، با تاریخ پیش‌بینی‌شده‌ای که از یک حد عبور می‌کنند.' },
        { name: 'Dependencies card (کارت وابستگی‌ها)', description: 'edgeهای سرویس‌به‌سرویس که از parent و peer در spanها ساخته می‌شوند. "Open traces" به Traces می‌رود.' },
        { name: 'Service profiles card (کارت پروفایل سرویس‌ها)', description: 'تعداد span، نرخ خطا، latency و پرتکرارترین operationها برای هر سرویس.' },
        { name: 'Limitations card (کارت محدودیت‌ها)', description: 'فهرست چیزهایی که قابل اندازه‌گیری نبودند و دلیل آن.' },
      ],
      tables: [
        {
          name: 'Service objectives table (جدول هدف‌های سرویس)',
          columns: [
            { name: 'Objective', meaning: 'نام و metricی که استفاده می‌کند.', example: 'Checkout availability - synthetic.up' },
            { name: 'Achieved', meaning: 'سهم نمونه‌های موجود در window که خوب بودند.', example: '99.95%' },
            { name: 'Target', meaning: 'سهمی که می‌خواهید به آن برسید.', example: '99.90%' },
            { name: 'State', meaning: 'Meeting (سبز) یا Breached (قرمز).', example: 'Meeting' },
            { name: 'Error budget', meaning: 'چه مقدار از خطاهای مجاز مصرف شده است. 100% یعنی target از دست رفته. از 80% به بعد نارنجی می‌شود.', example: '50% consumed' },
            { name: 'Samples', meaning: 'تعداد نمونه‌های پشت نتیجه.', example: '1,440' },
          ],
        },
        {
          name: 'Anomalies table (جدول anomalyها)',
          columns: [
            { name: 'Metric / Resource', meaning: 'چه چیزی انحراف پیدا کرده است.', example: 'docker.containers.cpu.usage / api-1' },
            { name: 'When', meaning: 'زمان نمونهٔ غیرعادی.', example: '2 hours ago' },
            { name: 'Value / Baseline', meaning: 'مقدار دیده‌شده و median معمول.', example: '88 vs 12' },
            { name: 'Direction', meaning: 'Above baseline یا Below baseline.', example: 'Above baseline' },
            { name: 'Score', meaning: 'میزان فاصله از حالت عادی، با واحدی شبیه انحراف معیار (sigma). هرچه بیشتر باشد غیرعادی‌تر است.', example: '6.2σ' },
          ],
        },
        {
          name: 'Capacity forecast table (جدول پیش‌بینی ظرفیت)',
          columns: [
            { name: 'Series', meaning: 'منبعی که دنبال می‌شود.', example: 'Disk usage /' },
            { name: 'Current / Threshold', meaning: 'مقدار فعلی و حدی که استفاده شده است.', example: '78% / 90%' },
            { name: 'Trend', meaning: 'تغییر در هر روز.', example: '+1.2/day' },
            { name: 'Projected crossing', meaning: 'تاریخی که threshold به آن می‌رسد، یا "Already crossed".', example: '24 Nov 2026, 10:00' },
            { name: 'Confidence', meaning: 'اینکه یک خط راست چقدر با نمونه‌ها برازش دارد.', example: '93%' },
          ],
        },
        {
          name: 'Dependencies table (جدول وابستگی‌ها)',
          columns: [
            { name: 'Edge', meaning: 'از caller به callee.', example: 'checkout -> payments' },
            { name: 'Calls / Errors', meaning: 'تعداد فراخوانی‌ها و سهم آن‌هایی که ناموفق بودند.', example: '1,200 / 2.5%' },
            { name: 'Mean / p95', meaning: 'میانگین و صدک ۹۵ام latency فراخوانی‌ها.', example: '60 ms / 210 ms' },
          ],
        },
      ],
      example: {
        title: 'مثال: افزودن هدف 99.9% availability برای یک وب‌سایت',
        steps: [
          'مطمئن شوید یک Synthetic check وجود دارد، چون metric به نام synthetic.up را ثبت می‌کند (۱ وقتی بالاست، ۰ وقتی پایین است).',
          'در "Objective definitions" نام "Checkout availability" و metric برابر synthetic.up را وارد کنید.',
          'Comparison را روی "At least the threshold is good"، Threshold را 1، Target % را 99.9، Window را 24 hours و Aggregation را avg بگذارید، سپس روی "Add objective" کلیک کنید.',
          'بعد از تحلیل بعدی، کارت "Service objectives" مقدار Achieved و Error budget را نشان می‌دهد. اگر Error budget از 80% بالاتر رفت، نزدیک است که target را از دست بدهید.',
        ],
      },
      tips: [
        'پیش‌بینی‌ها نمونهٔ کافی لازم دارند. کارت Capacity خالی معمولاً یعنی داده هنوز خیلی تازه است.',
        'Anomalyها فقط یک metric را با تاریخچهٔ اخیر خودش مقایسه می‌کنند. آن‌ها راهنما هستند، نه هشدار؛ برای paging از Alerts استفاده کنید.',
        'حذف یک objective هیچ داده‌ٔ metric را حذف نمی‌کند.',
      ],
    },

    'observability/integrations': {
      title: 'Integrations (یکپارچه‌سازی‌ها)',
      summary: 'سامانه‌های پایش بیرونی (Prometheus، Loki، Elasticsearch، Tempo، Jaeger، Datadog، CloudWatch، GCP، Azure Monitor و موارد دیگر) را وصل کنید، آن‌ها را تست کنید، محتوایشان را discover کنید و از داخل OpsDeck query اجرا کنید.',
      whenToUse: [
        'از قبل Prometheus، Loki یا Elasticsearch دارید و می‌خواهید از همین‌جا از آن‌ها query بگیرید.',
        'می‌خواهید بررسی کنید یک endpoint پایش در دسترس است.',
      ],
      howItWorks: [
        'هر integration از API بومی HTTP همان سامانه استفاده می‌کند. credentialها در vault رمزگذاری می‌شوند و هرگز به پنجره برگردانده نمی‌شوند. نتیجه‌ها از منبع واقعی می‌آیند، نه از داده‌ٔ ساختگی.',
        'همهٔ adapterها قابل query نیستند. Query فقط برای Prometheus، VictoriaMetrics، Netdata، Loki، Elasticsearch و OpenSearch ارائه می‌شود. adapterهای دیگر Test و Discover دارند.',
        'این صفحه خودش refresh نمی‌شود؛ از Refresh استفاده کنید.',
      ],
      parts: [
        HEADER,
        { name: 'Vault banner', description: 'می‌گوید از adapterهای واقعی استفاده می‌شود و کدام backend از vault credentialها را رمزگذاری می‌کند.' },
        {
          name: 'Sources card (کارت منبع‌ها)',
          description: 'integrationهای شما.',
          items: [
            { name: 'Add integration', description: 'فرمی باز می‌کند: name، adapter، base URL، host، port، "Use TLS"، username، password، bearer token، API key، organisation یا tenant، bucket، region، project id، tenant id، client id، client email، client secret، service account private key، extra headers به‌صورت JSON، timeout و enabled. فقط فیلدهایی را پر کنید که adapter شما لازم دارد.' },
            { name: 'Test (row)', description: 'سامانه را صدا می‌زند و "Integration reachable" یا خطا را گزارش می‌کند.' },
            { name: 'Discover (row)', description: 'از سامانه می‌پرسد چه چیزی دارد (مثلاً نام metricها یا labelها) و نتیجه را در کارت "Discovery result" نشان می‌دهد.' },
            { name: 'Query (row)', description: 'فقط برای adapterهای قابل query. فرمی با expression، یک index (فقط Elasticsearch و OpenSearch) و حداکثر تعداد نتیجه (۱ تا ۱۰۰۰) باز می‌کند. پاسخ خام در کارت "Query result" ظاهر می‌شود.' },
            { name: 'Edit / Delete (row)', description: 'تنظیمات را تغییر می‌دهد، یا بعد از تأیید حذف می‌کند (credentialهای ذخیره‌شده هم پاک می‌شوند).' },
          ],
        },
        { name: 'Discovery result and Query result cards', description: 'JSON خامی که سامانه برگردانده و بعد از استفاده از Discover یا Query زیر جدول نشان داده می‌شود.' },
        { name: 'Supported adapters card (کارت adapterهای پشتیبانی‌شده)', description: 'تگ‌هایی با همهٔ انواع adapter که OpsDeck پشتیبانی می‌کند. با نگه داشتن ماوس روی هر تگ توضیحش را می‌بینید.' },
      ],
      tables: [
        {
          name: 'Sources table (جدول منبع‌ها)',
          columns: [
            { name: 'Integration', meaning: 'نام و نوع adapter.', example: 'Production Prometheus / Prometheus' },
            { name: 'Endpoint', meaning: 'URL یا host.', example: 'https://prometheus.example.com' },
            { name: 'State', meaning: 'enabled یا disabled.', example: 'enabled' },
            { name: 'Connection', meaning: 'Connected، Unreachable یا "not tested"، با متن خطا در زیر آن.', example: 'Connected' },
            { name: 'Last test', meaning: 'مدت زمان از آخرین تست.', example: '5 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'مثال: query گرفتن از Prometheus برای نرخ CPU',
        steps: [
          'روی "Add integration" کلیک کنید، adapter را Prometheus انتخاب کنید، نام "Production Prometheus" را بدهید و base URL را وارد کنید.',
          'ذخیره کنید و روی "Test" کلیک کنید. پیام "Integration reachable" درستی URL و credentialها را تأیید می‌کند.',
          'روی "Query" کلیک کنید و این را وارد کنید: rate(node_cpu_seconds_total[5m]). یک محدودیت برای تعداد نتیجه بگذارید و روی "Run query" کلیک کنید.',
          'پاسخ در کارت "Query result" ظاهر می‌شود.',
        ],
      },
      tips: [
        'queryهای Loki از LogQL استفاده می‌کنند، مثلاً {app="api"} |= "error". Elasticsearch یک query string یا یک query به‌صورت JSON را که با آکولاد شروع شود می‌پذیرد.',
        'برای هر integration از یک token فقط‌خواندنی استفاده کنید.',
        'نتیجه‌ها به‌صورت JSON نشان داده می‌شوند و در metric store مربوط به OpsDeck ذخیره نمی‌شوند.',
      ],
    },

    'observability/notifications': {
      title: 'Notifications (اعلان‌ها)',
      summary: 'کانال‌های تحویل (webhook، Slack، Discord، Telegram، email) که پیام‌های alert و incident را دریافت می‌کنند.',
      whenToUse: [
        'می‌خواهید وقتی alertی فعال یا resolved می‌شود، بیرون از OpsDeck باخبر شوید.',
        'باید بررسی کنید یک کانال درست کار می‌کند.',
      ],
      howItWorks: [
        'وقتی alertی فعال یا resolved می‌شود، OpsDeck به همهٔ کانال‌های enabled پیام می‌فرستد. Silenceها در صفحهٔ Alerts این پیام‌ها را متوقف می‌کنند.',
        'tokenها و رمزهای SMTP در vault رمزگذاری می‌شوند و هرگز به پنجره برگردانده نمی‌شوند؛ جدول فقط عبارت "secret stored" را نشان می‌دهد.',
        'این صفحه خودش refresh نمی‌شود؛ از Refresh استفاده کنید.',
      ],
      parts: [
        HEADER,
        {
          name: 'Delivery channels card (کارت کانال‌های تحویل)',
          description: 'فهرست کانال‌ها.',
          items: [
            { name: 'Add channel', description: 'فرمی باز می‌کند: name، type (webhook، slack، discord، telegram، email) و بعد فیلدهایی که آن type لازم دارد. Webhook، Slack و Discord از یک URL استفاده می‌کنند. Email از SMTP host، port، username، password، From address و Recipients (جداشده با ویرگول) استفاده می‌کند، با گزینه‌های "Use implicit TLS" و "Use STARTTLS". Telegram از chat id و bot token استفاده می‌کند. یک signing secret و "Verify TLS certificates" هم در دسترس است، به‌علاوهٔ "Enabled".' },
            { name: 'Send test (row)', description: 'همین حالا یک پیام آزمایشی می‌فرستد. "Test notification sent" یا "Delivery failed" را همراه با دلیل می‌بینید.' },
            { name: 'Edit (row)', description: 'کانال را تغییر می‌دهد.' },
            { name: 'Delete (row)', description: 'بعد از تأیید، کانال و secret ذخیره‌شدهٔ آن را حذف می‌کند.' },
          ],
        },
        { name: 'Secrets banner', description: 'توضیح می‌دهد که secretها در main process می‌مانند.' },
      ],
      tables: [
        {
          name: 'Delivery channels table (جدول کانال‌های تحویل)',
          columns: [
            { name: 'Channel', meaning: 'نام و نوع.', example: 'On-call Slack / slack' },
            { name: 'Destination', meaning: 'URL، host یا chat id.', example: 'https://hooks.slack.com/services/...' },
            { name: 'State', meaning: 'enabled یا disabled.', example: 'enabled' },
            { name: 'Credentials', meaning: '"secret stored" (آبی) یا "no secret".', example: 'secret stored' },
          ],
        },
      ],
      example: {
        title: 'مثال: ارسال alertها به Slack',
        steps: [
          'در Slack یک incoming webhook بسازید و URL آن را کپی کنید.',
          'روی "Add channel" کلیک کنید، type را slack انتخاب کنید، یک نام بدهید و URL را paste کنید، سپس ذخیره کنید.',
          'روی "Send test" کلیک کنید. یک پیام در کانال Slack می‌رسد و OpsDeck عبارت "Test notification sent" را نشان می‌دهد.',
          'از این به بعد هر alert فعال یا resolved شده همان‌جا ارسال می‌شود.',
        ],
      },
      tips: [
        'URL مربوط به webhook یک راز است. هر کسی که آن را داشته باشد می‌تواند در کانال شما پیام بگذارد.',
        'پورت 465 معمولاً "implicit TLS" می‌خواهد؛ پورت 587 معمولاً STARTTLS.',
        'اگر تست ناموفق بود، toast دلیل دقیق را نشان می‌دهد (DNS، TLS، 4xx).',
      ],
    },

    'observability/agents': {
      title: 'Agents & ingest (ایجنت‌ها و دریافت داده)',
      summary: 'وب‌سرور کوچک محلی (ingest receiver) را که metric، log و trace ارسالی از agentها و exporterهای OpenTelemetry را می‌پذیرد، و tokenهایی را که این agentها استفاده می‌کنند، کنترل می‌کند.',
      whenToUse: [
        'می‌خواهید یک برنامه یا ماشین دیگر telemetry را به OpsDeck push کند.',
        'باید یک agent token بسازید یا باطل (revoke) کنید.',
      ],
      howItWorks: [
        'receiver به‌طور پیش‌فرض خاموش است. آن را در Settings فعال کنید؛ مگر اینکه bind address را تغییر دهید، روی 127.0.0.1 گوش می‌دهد (فقط همین ماشین). agentها با یک bearer token احراز هویت می‌شوند.',
        'فقط JSON می‌پذیرد: snapshotهای metric از agent، trace و log و metric به‌صورت OTLP/HTTP JSON، و ingest ساده برای log یا metric. Protobuf با HTTP 415 رد می‌شود.',
        'این صفحه خودش refresh نمی‌شود؛ از Refresh استفاده کنید.',
      ],
      parts: [
        HEADER,
        {
          name: 'Stat cards (کارت‌های آمار)',
          description: 'Receiver (حالت Listening همراه با آدرس و پورت، یا Stopped)، Agents (ثبت‌شده و online) و Requests (دریافت‌شده از زمان شروع receiver).',
        },
        { name: 'Receiver error banner', description: 'اگر receiver نتوانست شروع شود ظاهر می‌شود، مثلاً "Port 8787 is already in use."' },
        { name: 'Ingest endpoint banner', description: 'وقتی در حال اجراست URLی را که باید به آن POST کنید نشان می‌دهد. وقتی متوقف است، می‌گوید آن را در Settings فعال کنید.' },
        {
          name: 'Registered agents card (کارت agentهای ثبت‌شده)',
          description: 'agentهای شما.',
          items: [
            { name: 'Restart receiver', description: 'receiver را متوقف و دوباره شروع می‌کند و تنظیمات تغییرکرده در Settings، مثل port، را اعمال می‌کند.' },
            { name: 'Create agent', description: 'یک agent می‌سازد و bearer token آن را فقط یک بار در یک dialog با دکمهٔ Copy token نشان می‌دهد. token دوباره قابل نمایش نیست.' },
            { name: 'Revoke (row)', description: 'بعد از تأیید، agent دیگر نمی‌تواند داده push کند. رکورد باقی می‌ماند و با برچسب revoked علامت می‌خورد.' },
            { name: 'Remove (row)', description: 'بعد از تأیید، رکورد agent را حذف می‌کند.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Registered agents table (جدول agentهای ثبت‌شده)',
          columns: [
            { name: 'Agent', meaning: 'نام و agent id.', example: 'web-1 / agent-3f2a...' },
            { name: 'Platform', meaning: 'سیستم‌عاملی که agent گزارش کرده است.', example: 'linux' },
            { name: 'State', meaning: 'online (سبز)، offline (خاکستری) یا revoked (قرمز).', example: 'online' },
            { name: 'Last seen', meaning: 'آخرین باری که داده push کرده، یا "never".', example: '12 seconds ago' },
          ],
        },
      ],
      example: {
        title: 'مثال: ارسال trace از یک برنامه',
        steps: [
          'Settings را باز کنید، گزینهٔ "Enable ingest receiver" را تیک بزنید و ذخیره کنید. وقتی به این صفحه برگشتید، "Receiver" باید Listening باشد.',
          'روی "Create agent" کلیک کنید، یک نام بدهید و token را از dialog کپی کنید.',
          'در برنامهٔ خود، OTLP traces endpoint را روی آدرس receiver به‌اضافهٔ /v1/otlp/traces بگذارید، protocol را http/json قرار دهید و header به نام Authorization: Bearer <token> را اضافه کنید.',
          'ظرف یک دقیقه، traceها در صفحهٔ Traces و سرویس‌ها در Applications ظاهر می‌شوند.',
        ],
      },
      tips: [
        'bind address را روی 127.0.0.1 نگه دارید، مگر اینکه واقعاً لازم باشد ماشین‌های دیگر وصل شوند. 0.0.0.0 receiver را در معرض شبکهٔ شما قرار می‌دهد.',
        'token را همان لحظه ذخیره کنید؛ فقط یک بار نشان داده می‌شود.',
        'شمارندهٔ Requests با restart شدن receiver صفر می‌شود.',
      ],
    },

    'observability/remediation': {
      title: 'Remediation (رفع خودکار مشکل)',
      summary: 'اجازه می‌دهد یک alert یک راه‌حل از پیش تأییدشده، مثل restart کردن یک کانتینر، را با محدودیت‌ها و ردپای ممیزی کامل فعال کند. به‌طور پیش‌فرض غیرفعال است.',
      whenToUse: [
        'یک مشکل شناخته‌شده همیشه راه‌حل امن یکسانی دارد.',
        'می‌خواهید یک راه‌حل را دستی اجرا کنید و از آن سابقه نگه دارید.',
      ],
      howItWorks: [
        'فقط یک allowlist کوتاه از اقدام‌ها وجود دارد: restart یک کانتینر Docker، restart یک پروژهٔ Compose، restart یک workload در Kubernetes، اجرای یک HTTP health check، ارسال یک notification webhook. هیچ چیز دیگری قابل اجرا نیست.',
        'یک policy یک alert rule (یا هر alert) را به یک action و target وصل می‌کند، با حداقل severity، یک cooldown و حداکثر تعداد اجرا در ساعت. policy تأیید صریح می‌خواهد، مگر اینکه آن را روی اجرای خودکار بگذارید.',
        'اتوماسیون یک کلید اصلی (master switch) دارد. تا وقتی خاموش است هیچ چیز خودکار اجرا نمی‌شود. هر تلاش، چه موفق چه ناموفق، در audit trail پایین ثبت می‌شود. OpsDeck هرگز به‌خاطر پاسخ هوش مصنوعی remediation اجرا نمی‌کند.',
        'این صفحه خودش refresh نمی‌شود؛ از Refresh استفاده کنید.',
      ],
      parts: [
        HEADER,
        {
          name: 'Automation safety card (کارت ایمنی اتوماسیون)',
          description: 'کلید اصلی و allowlist.',
          items: [
            { name: 'Enable / Disable', description: 'remediation خودکار را روشن یا خاموش می‌کند. هر دو تأیید می‌خواهند. Disable کردن همهٔ اقدام‌های خودکار را بلافاصله متوقف می‌کند.' },
            { name: 'Action tags', description: 'اقدام‌های موجود در allowlist، به‌صورت برچسب.' },
          ],
        },
        {
          name: 'Policies card (کارت policyها)',
          description: 'policyهای شما.',
          items: [
            { name: 'Add policy', description: 'فرمی باز می‌کند: policy name؛ action؛ alert rule id (خالی یعنی هر alert)؛ minimum severity؛ approval (تأیید صریح لازم باشد، یا خودکار اجرا شود)؛ target به‌صورت JSON؛ cooldown seconds؛ maximum per hour (۱ تا ۶۰)؛ "Enable this policy". مقدارهای پیش‌فرض امن هستند: action برابر docker.restart، severity برابر critical، approval لازم، cooldown برابر 300 s، 3 بار در ساعت، و policy غیرفعال شروع می‌شود.' },
            { name: 'Run (row)', description: 'بعد از تأیید شما، policy را همین حالا اجرا می‌کند؛ پنجرهٔ تأیید target دقیق را نشان می‌دهد. کلیک شما به‌منزلهٔ approval است.' },
            { name: 'Edit / Delete (row)', description: 'policy را تغییر می‌دهد، یا بعد از تأیید حذف می‌کند. audit trail حفظ می‌شود.' },
          ],
        },
        { name: 'Recent executions card (کارت اجراهای اخیر)', description: 'audit trail تلاش‌ها.' },
      ],
      tables: [
        {
          name: 'Policies table (جدول policyها)',
          columns: [
            { name: 'Policy', meaning: 'نام و action.', example: 'Restart the API container / docker.restart' },
            { name: 'State', meaning: 'enabled یا disabled.', example: 'enabled' },
            { name: 'Approval', meaning: '"approval required" (آبی) یا "auto" (نارنجی).', example: 'approval required' },
            { name: 'Alert rule', meaning: 'rule id که آن را فعال می‌کند، یا "any alert".', example: 'any alert' },
            { name: 'Limits', meaning: 'cooldown و حداکثر تعداد اجرا در ساعت.', example: '300s / 3 per hour' },
          ],
        },
        {
          name: 'Recent executions table (جدول اجراهای اخیر)',
          columns: [
            { name: 'Policy / Action', meaning: 'چه چیزی اجرا شده است.', example: 'Restart the API container / docker.restart' },
            { name: 'Result', meaning: 'Succeeded یا Failed.', example: 'Succeeded' },
            { name: 'Actor', meaning: 'چه کسی یا چه چیزی آن را شروع کرده، مثلاً operatorی که روی Run کلیک کرده است.', example: 'operator' },
            { name: 'When', meaning: 'مدت زمان از اجرا.', example: '3 minutes ago' },
            { name: 'Detail', meaning: 'پیام نتیجه یا خطا.', example: 'Container restarted' },
          ],
        },
      ],
      example: {
        title: 'مثال: restart دستی یک کانتینر تحت یک policy',
        steps: [
          'روی "Add policy" کلیک کنید، نام "Restart the API container" را بدهید، docker.restart را انتخاب کنید و target را به‌صورت {"containerId":"api-1"} وارد کنید.',
          'Approval را روی "Require explicit approval" بگذارید و ذخیره کنید. policy غیرفعال شروع می‌شود.',
          'روی "Run" در همان ردیف کلیک کنید. پنجرهٔ تأیید target را نشان می‌دهد؛ روی "Run now" کلیک کنید.',
          'یک ردیف جدید زیر Recent executions با نتیجه و actor برابر "operator" ظاهر می‌شود.',
        ],
      },
      tips: [
        'اول action و target را دستی تست کنید و بعد از آن به "Run automatically" فکر کنید.',
        'cooldown جلوی حلقهٔ restart را می‌گیرد: policy تا وقتی cooldown نگذشته دوباره اجرا نمی‌شود.',
        'target به‌صورت JSON است. برای یک workload در Kubernetes از {"kind":"deployments","name":"api","namespace":"prod"} استفاده کنید.',
      ],
    },

    'observability/settings': {
      title: 'Settings (تنظیمات)',
      summary: 'تعیین می‌کند داده هر چند وقت یک بار جمع شود، کدام collectorها اجرا شوند، داده چه مدت نگه‌داری شود، و همچنین ingest receiver و ترجیحات workspace را کنترل می‌کند.',
      whenToUse: [
        'می‌خواهید collectorی را که استفاده نمی‌کنید خاموش کنید.',
        'می‌خواهید logها یا metricها را مدت بیشتری نگه دارید، یا فضای دیسک صرفه‌جویی کنید.',
        'باید ingest receiver را برای agentها یا OpenTelemetry فعال کنید.',
      ],
      howItWorks: [
        'تغییرات فقط وقتی اعمال می‌شوند که روی "Save settings" کلیک کنید؛ ترک کردن صفحه ویرایش‌ها را دور می‌ریزد. داده به‌صورت محلی در فایل‌هایی ذخیره می‌شود که فقط خودتان می‌توانید بخوانید.',
        'صفحه هر بار که باز می‌کنید مقدارهای فعلی را بارگذاری می‌کند.',
      ],
      parts: [
        HEADER,
        {
          name: 'Collection card (کارت جمع‌آوری)',
          description: 'تناوب جمع‌آوری و اینکه کدام collectorها اجرا شوند.',
          items: [
            { name: 'Monitoring enabled', description: 'کلید اصلی. برداشتن تیک آن همهٔ collectorهای زمان‌بندی‌شده را متوقف می‌کند.' },
            { name: 'Base interval (seconds)', description: 'collectorهای اصلی هر چند وقت یک بار اجرا شوند، از ۲ تا ۳۰۰. پیش‌فرض ۱۰.' },
            { name: 'Database interval (seconds)', description: 'metricهای پایگاه داده هر چند وقت یک بار خوانده شوند، از ۵ تا ۶۰۰. پیش‌فرض ۳۰.' },
            { name: 'Auto-connect saved database profiles', description: 'برای profileهای ذخیره‌شدهٔ پایگاه داده session باز می‌کند تا metricهایشان حتی وقتی خودتان وصل نشده‌اید خوانده شود.' },
            { name: 'Collector checkboxes', description: 'یکی برای هر collector (مثلاً Local، Network، Docker، Kubernetes، Databases، Synthetic، Remote، Logs، Applications). تیک مواردی را که لازم ندارید بردارید.' },
          ],
        },
        {
          name: 'Retention card (کارت نگه‌داری داده)',
          description: 'داده چه مدت نگه‌داری شود.',
          items: [
            { name: 'Raw samples (hours)', description: 'از ۱ تا ۷۲۰، پیش‌فرض ۲۴.' },
            { name: 'Aggregate retention (days)', description: 'تاریخچهٔ metric به‌صورت aggregate، از ۱ تا ۳۶۵۰، پیش‌فرض ۳۰.' },
            { name: 'Log retention (days)', description: 'از ۱ تا ۳۶۵، پیش‌فرض ۷.' },
            { name: 'Trace retention (days)', description: 'از ۱ تا ۳۶۵، پیش‌فرض ۷.' },
            { name: 'Maximum log records', description: 'از ۱۰۰ تا ۲۰۰٬۰۰۰، پیش‌فرض ۲۰٬۰۰۰.' },
            { name: 'Maximum series', description: 'سقف تعداد seriesهای متمایز metric، از ۱۰۰ تا ۱۰۰٬۰۰۰، پیش‌فرض ۵٬۰۰۰.' },
          ],
        },
        {
          name: 'Agent & OTLP receiver card (کارت receiver برای agent و OTLP)',
          description: 'ingest receiver که به‌طور پیش‌فرض محلی است.',
          items: [
            { name: 'Enable ingest receiver', description: 'receiver را بعد از ذخیره (یا بعد از Restart receiver در Agents & ingest) شروع می‌کند.' },
            { name: 'Bind address', description: '127.0.0.1 فقط برای همین ماشین؛ 0.0.0.0 برای همهٔ interfaceهای شبکه.' },
            { name: 'Port', description: 'پورت TCP، پیش‌فرض 8787.' },
            { name: 'TLS', description: 'نیاز دارد برای receiver یک certificate تنظیم شده باشد.' },
          ],
        },
        {
          name: 'Workspace preferences card (کارت ترجیحات workspace)',
          description: 'بازهٔ زمانی پیش‌فرض (15m، 1h، 6h، 24h یا 7d) و شناسهٔ widgetهای Overview به‌صورت فهرستی جداشده با ویرگول.',
        },
        {
          name: 'Action buttons (دکمه‌های اقدام)',
          description: 'در پایین صفحه.',
          items: [
            { name: 'Save settings', description: 'همهٔ تغییرات صفحه را اعمال و ذخیره می‌کند.' },
            { name: 'Export configuration', description: 'پیکربندی شما را در یک فایل JSON که انتخاب می‌کنید ذخیره می‌کند.' },
          ],
        },
      ],
      example: {
        title: 'مثال: نگه داشتن logها به مدت ۳۰ روز',
        steps: [
          'در Retention مقدار "Log retention (days)" را روی 30 بگذارید.',
          'اگر log زیادی جمع می‌کنید، "Maximum log records" را هم بالا ببرید، چون سقف تعداد رکورد حتی پیش از رسیدن به محدودیت زمانی خطوط قدیمی را حذف می‌کند.',
          'روی "Save settings" کلیک کنید. پیام "Settings saved" را می‌بینید.',
        ],
      },
      tips: [
        'base interval کمتر داده تازه‌تری می‌دهد اما CPU و دیسک بیشتری مصرف می‌کند.',
        'کم کردن retention با گذشت زمان داده قدیمی را حذف می‌کند؛ پس اگر به آن نیاز دارید، اول export بگیرید یا یک report بسازید.',
        'receiver را در یک شبکهٔ غیرقابل اعتماد به 0.0.0.0 bind نکنید.',
      ],
    },
  });
})();
