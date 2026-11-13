'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.helpFa = OD.helpFa || {};
  Object.assign(OD.helpFa, {
    'intelligence/overview': {
      title: 'Overview (نمای کلی)',
      summary: 'یک تصویر فقط‌خواندنی از هر چیزی که OpsDeck می‌تواند ببیند: Docker، Kubernetes، پایگاه‌داده‌ها، هاست‌ها و observability. این صفحه نقطهٔ شروع فضای کاری Intelligence است.',
      whenToUse: [
        'OpsDeck را باز می‌کنید و می‌خواهید در چند ثانیه بفهمید آیا چیزی نیاز به توجه دارد یا نه.',
        'می‌خواهید از یک عدد خلاصه مستقیم به صفحه‌ای بروید که آن را توضیح می‌دهد (changes، timeline، environments، automation).',
      ],
      howItWorks: [
        'این صفحه در یک لحظه فهرست یکپارچهٔ منابع، رویدادهای ۲۴ ساعت اخیر، آخرین تغییرات، هشدارهای firing یا pending، incidentها و automationها را می‌خواند. هیچ چیز ساختگی نیست: هر عدد از ماژولی می‌آید که آن را گزارش کرده است.',
        'تا وقتی در این صفحه هستید، هر ۴۵ ثانیه خودش را به‌روز می‌کند (فقط وقتی پنجره قابل‌مشاهده است). با رسیدن یک رویداد automation هم دوباره بارگذاری می‌شود. برای بارگذاری فوری از دکمهٔ Refresh در سربرگ صفحه استفاده کنید.',
        'همهٔ صفحه‌های Intelligence سربرگ یکسانی دارند: عنوان صفحه، دکمهٔ Ask AI (دربارهٔ همین صفحه از دستیار می‌پرسد) و دکمهٔ Refresh. در Overview دو دکمهٔ اضافه هم هست: Search everything (Global search را باز می‌کند) و Run a dry-run (Automation را باز می‌کند).',
      ],
      parts: [
        {
          name: 'Stat cards (کارت‌های آمار)',
          description: 'پنج کارت در بالای صفحه.',
          items: [
            { name: 'Resources', description: 'تعداد کل منابع از همهٔ منبع‌ها، به‌همراه تعداد منبع‌هایی که گزارش می‌دهند. مثال: 132 resources و 4 sources reporting.' },
            { name: 'Need attention', description: 'منابعی که وضعیتشان unhealthy یا degraded است، با تفکیک آن‌ها در زیر عدد. مثال: 3 need attention یعنی 2 unhealthy و 1 degraded. وقتی عدد بیشتر از صفر باشد، کارت نارنجی می‌شود.' },
            { name: 'Change records', description: 'تعداد رکوردهای تغییری که نگه‌داری شده‌اند (تفاوت‌هایی که بین snapshotها پیدا شده است).' },
            { name: 'Open alerts', description: 'هشدارهایی که firing یا pending هستند، به‌علاوهٔ تعداد incidentهایی که هنوز resolved یا closed نشده‌اند.' },
            { name: 'Automations', description: 'تعداد automationهای فعال و تعداد کل automationهایی که تنظیم شده‌اند.' },
          ],
        },
        {
          name: 'Environment strip (نوار محیط‌ها)',
          description: 'فقط وقتی نمایش داده می‌شود که environment وجود داشته باشد. برای هر environment یک chip هست که تعداد منابع و تعداد منابع unhealthy را نشان می‌دهد. با کلیک روی chip صفحهٔ Environments باز می‌شود.',
        },
        {
          name: 'Coverage by module (پوشش به تفکیک ماژول)',
          description: 'برای هر ماژولی که منابع گزارش کرده (Docker، Kubernetes، Databases، Observability، Hosts) یک ردیف هست. هر ردیف مجموع، یک نوار سبز برای سهم سالم‌ها و عبارت "N need attention" را وقتی بعضی منابع unhealthy یا degraded هستند نشان می‌دهد.',
        },
        {
          name: 'Source health (سلامت منبع‌ها)',
          description: 'برای هر collector یک ردیف با نشان وضعیت هست: collected (سبز) یا unavailable (قرمز). ستون جزئیات نشان می‌دهد چه مدت پیش خوانده شده یا خطا چیست. هر collector مستقل است، پس خراب‌شدن یک منبع (مثلاً اجرا نبودن Docker) بقیه را پنهان نمی‌کند.',
        },
        {
          name: 'Recent changes (تغییرات اخیر)',
          description: 'چند تغییر آخری که شناسایی شده، با زمان، نشان severity، عنوان، جزئیات و ماژول. دکمهٔ Open changes شما را به صفحهٔ Changes می‌برد.',
        },
        {
          name: 'Recent events (رویدادهای اخیر)',
          description: 'آخرین رویدادهای ۲۴ ساعت گذشته (Docker، Kubernetes، پایگاه‌داده‌ها، هشدارها، automation). دکمهٔ Open timeline شما را به Unified timeline می‌برد.',
        },
        {
          name: 'Favourites (مورد علاقه‌ها)',
          description: 'منابعی که در صفحهٔ Resources با دکمهٔ ستاره پین کرده‌اید. روی نام کلیک کنید تا منبع در فضای کاری خودش باز شود؛ روی ستاره کلیک کنید تا از فهرست حذف شود.',
        },
        {
          name: 'Read-only banner (بنر فقط‌خواندنی)',
          description: 'یادآوری اینکه Intelligence فقط مشاهده می‌کند. فقط وقتی یک منبع را تغییر می‌دهد که automationای را اجرا کنید که از approval gate گذشته باشد.',
        },
      ],
      example: {
        title: 'مثال: بررسی سلامت صبحگاهی',
        steps: [
          'Overview را باز کنید. کارت "Need attention" عدد 2 را نشان می‌دهد (1 unhealthy و 1 degraded).',
          'در Source health می‌بینید Kubernetes با یک خطای اتصال unavailable است؛ یعنی عددهای کلاستر ناقص‌اند و صفر نیستند.',
          'در Coverage by module، Docker عبارت "14 healthy, 1 need attention" را نشان می‌دهد. Resources را باز کنید، ماژول Docker و state unhealthy را فیلتر کنید تا کانتینر را پیدا کنید.',
          'در Recent events ببینید درست قبل از unhealthy شدن چه اتفاقی افتاده است.',
        ],
      },
      tips: [
        'خالی بودن کارت "Recent changes" در نصب تازه عادی است: اولین snapshot فقط یک baseline است و تفاوت‌ها بعد از collection بعدی ظاهر می‌شوند.',
        'منبعی که unavailable علامت خورده یعنی منابعش در همهٔ مجموع‌ها غایب‌اند، نه اینکه سالم باشند.',
      ],
    },

    'intelligence/graph': {
      title: 'Infrastructure graph (گراف زیرساخت)',
      summary: 'نقشه‌ای از اینکه منابع شما در ماژول‌های مختلف چطور به هم مرتبط‌اند (یک کانتینر از یک image استفاده می‌کند، یک pod روی یک node اجرا می‌شود، یک پایگاه‌داده داخل یک کانتینر است). هر رابطه با برچسب observed یا inferred مشخص می‌شود.',
      whenToUse: [
        'قبل از restart یا تغییر چیزی می‌خواهید بدانید چه چیزی به چه چیزی وابسته است.',
        'می‌خواهید ببینید کدام منابع بیشترین ارتباط را دارند (و در نتیجه دست‌زدن به آن‌ها پرریسک‌تر است).',
        'می‌خواهید بررسی کنید OpsDeck چرا فکر می‌کند دو منبع به هم مرتبط‌اند.',
      ],
      howItWorks: [
        'گراف از داده‌هایی ساخته می‌شود که ماژول‌ها همین حالا گزارش می‌دهند: labelها، شبکه‌ها، mountها و پروژه‌های Compose در Docker؛ ownership، selectorها و جایگذاری روی node در Kubernetes؛ پایگاه‌داده‌های کشف‌شده؛ و trace spanهایی که نام یک سرویس مقابل را دارند.',
        'یال‌های observed مستقیماً از داده‌های گزارش‌شدهٔ زمان اجرا می‌آیند (مثلاً "Mount pgdata" یا "Pod spec.nodeName worker-1"). یال‌های inferred حدس‌های ضعیف‌ترند (مثلاً یک پروفایل پایگاه‌داده که به localhost:5432 اشاره می‌کند و با یک پورت منتشرشدهٔ کانتینر جور است). OpsDeck هرگز فقط برای کامل‌به‌نظر‌رسیدن تصویر یال اضافه نمی‌کند، پس منابع بی‌ارتباط بدون اتصال می‌مانند.',
        'نقشه، گره‌های با بیشترین degree را برای هر ماژول نشان می‌دهد (حداکثر ۱۲ گره در هر ستون ماژول). جدول‌های زیر آن موارد بیشتری را فهرست می‌کنند. برای ساخت دوبارهٔ گراف از Refresh استفاده کنید.',
      ],
      parts: [
        {
          name: 'Filter bar (نوار فیلتر)',
          description: 'سه منوی کشویی و یک شمارنده.',
          items: [
            { name: 'All modules', description: 'گراف را به یک ماژول محدود می‌کند (Docker، Kubernetes، Databases، Observability، Hosts، Intelligence). گراف دوباره بارگذاری می‌شود.' },
            { name: 'All environments', description: 'گراف را به منابعی که به یک environment اختصاص داده شده‌اند محدود می‌کند. گراف دوباره بارگذاری می‌شود.' },
            { name: 'All relationships / Observed only / Inferred only', description: 'همهٔ یال‌ها، فقط یال‌های قابل‌اعتماد، یا فقط حدس‌ها را نشان می‌دهد. این فیلتر بلافاصله روی نقشه و جدول Relationships اعمال می‌شود.' },
            { name: 'Counter', description: 'مجموع‌های کل گراف، مثلاً 87 nodes، 112 edges، 96 observed، 16 inferred.' },
          ],
        },
        {
          name: 'Graph drawing (نقشهٔ گراف)',
          description: 'برای هر ماژول یک ستون، برای هر منبع یک جعبه و برای روابط خط‌های منحنی. خط ممتد یک یال observed است و خط خط‌چین یا کم‌رنگ‌تر یک یال inferred (راهنما بالای نقشه است). هر جعبه نام منبع، نوع آن و یک نقطهٔ کوچک وضعیت را نشان می‌دهد. روی یک جعبه یا خط بروید تا tooltip ببینید (نام، نوع، وضعیت، environment، یا رابطه و confidence). روی یک جعبه کلیک کنید تا آن منبع در فضای کاری خودش باز شود. راهنما عبارت "Showing N of M nodes" را هم می‌گوید.',
        },
        {
          name: 'Notices (اعلان‌ها)',
          description: 'بنر "What this graph does not show" نقاط کور شناخته‌شده‌ای را فهرست می‌کند که سازندهٔ گراف گزارش داده است. بنر "Isolated resources" می‌گوید چند منبع هیچ رابطهٔ کشف‌شده‌ای ندارند؛ آن‌ها بدون یال ساختگی فهرست می‌شوند.',
        },
        {
          name: 'Most connected resources (پرارتباط‌ترین منابع)',
          description: '۳۰ منبع برتر بر اساس degree (تعداد روابط). لینک‌ها منبع را در فضای کاری‌اش باز می‌کنند.',
        },
        {
          name: 'Relationships (روابط)',
          description: '۴۰ یال قابل‌مشاهدهٔ اول، همراه با شواهدی که هر یال را ساخته‌اند.',
        },
      ],
      tables: [
        {
          name: 'Most connected resources',
          columns: [
            { name: 'Resource', meaning: 'نام (به‌صورت لینک) و در زیر آن نوع و namespace.', example: 'api-7d9f · pod · shop' },
            { name: 'Module', meaning: 'منبع به کدام فضای کاری تعلق دارد.', example: 'Kubernetes' },
            { name: 'Status', meaning: 'healthy، degraded، unhealthy، stopped یا unknown.', example: 'healthy' },
            { name: 'Environment', meaning: 'environment اختصاص‌داده‌شده، یا unassigned.', example: 'Production' },
            { name: 'Degree', meaning: 'منبع چند رابطه دارد.', example: '9' },
          ],
        },
        {
          name: 'Relationships',
          columns: [
            { name: 'From', meaning: 'منبع مبدأ یال.', example: 'web-1' },
            { name: 'Relationship', meaning: 'نوع پیوند: runs-on، uses-image، attached-to، uses-volume، part-of، contains، scheduled-on، runs-in، connects-to، depends-on، observed-depends-on، selects، owns، routes.', example: 'uses-volume' },
            { name: 'To', meaning: 'منبع مقصد یال.', example: 'pgdata' },
            { name: 'Confidence', meaning: 'observed (سبز) یا inferred (کهربایی).', example: 'inferred' },
            { name: 'Evidence', meaning: 'همان واقعیتی که یال را ساخته است.', example: 'localhost:5432 matches a published container port' },
          ],
        },
      ],
      example: {
        title: 'مثال: چه چیزی به این پایگاه‌داده وابسته است؟',
        steps: [
          'گراف را باز کنید و فیلتر ماژول را روی Databases بگذارید.',
          'در جدول Most connected resources مورد "orders-db" را پیدا کنید و degree آن را ببینید.',
          'فیلتر confidence را روی Observed only بگذارید تا حدس‌ها حذف شوند.',
          'در Relationships ردیف‌هایی را بخوانید که orders-db در آن‌ها هست: "runs-in" یک کانتینر و "observed-depends-on" از یک سرویس برنامه، با شواهد trace در ستون آخر.',
        ],
      },
      tips: [
        'یال‌های inferred را راهنمایی برای بررسی بدانید، نه واقعیت قطعی.',
        'منبعی که هیچ خطی ندارد خراب نیست؛ فقط رابطه‌ای برایش کشف نشده است.',
        'نقشه برای هر ماژول سقف دارد، پس برای تمرکز روی یک ناحیهٔ شلوغ از فیلتر ماژول استفاده کنید.',
      ],
    },

    'intelligence/resources': {
      title: 'Resources (منابع)',
      summary: 'یک فهرست واحد از همهٔ منابعی که هر ماژول گزارش می‌دهد: کانتینرها، podها، پایگاه‌داده‌ها، هاست‌ها و بیشتر، همراه با وضعیت و environment آن‌ها.',
      whenToUse: [
        'می‌خواهید منبعی را پیدا کنید بدون اینکه یادتان باشد کدام فضای کاری صاحب آن است.',
        'می‌خواهید همهٔ منابع unhealthy یا همهٔ منابع یک environment را ببینید.',
        'می‌خواهید منابع را به environmentها اختصاص دهید یا موارد مورد علاقه را پین کنید.',
        'می‌خواهید بدون ترک صفحه نگاه سریعی به یک منبع بیندازید.',
      ],
      howItWorks: [
        'این فهرست snapshot زنده‌ای است که از همهٔ ماژول‌ها جمع شده. منوهای module، kind، state و environment از backend می‌خواهند فیلتر کند؛ کادر جستجو ردیف‌های بارگذاری‌شده را همان‌جا بر اساس نام، kind، module، host، namespace یا state فیلتر می‌کند.',
        'ردیف‌ها در هر صفحه ۶۰ تا نمایش داده می‌شوند. اگر منبعی پاسخ نداده باشد، زیر جدول یک بنر هشدار ظاهر می‌شود.',
      ],
      parts: [
        {
          name: 'Filter bar (نوار فیلتر)',
          items: [
            { name: 'Filter resources', description: 'فیلتر متنی آزاد روی name، kind، module، host، namespace و status.' },
            { name: 'All modules / kinds / states / environments', description: 'منوهای کشویی. kindها و stateها از چیزی ساخته می‌شوند که همین حالا در فهرست هست.' },
            { name: 'Counter', description: 'چند ردیف نمایش داده شده، عبارت "of N" وقتی فیلتر بعضی را پنهان کرده، و اینکه snapshot چه زمانی گرفته شده است.' },
          ],
        },
        {
          name: 'Unified resource inventory (فهرست یکپارچهٔ منابع)',
          description: 'خود جدول. لینک نام، منبع را در فضای کاری بومی خودش باز می‌کند (مثلاً یک کانتینر در Docker باز می‌شود).',
          items: [
            { name: 'Inspect (eye icon)', description: 'پنل کناری منبع را (پایین‌تر توضیح داده شده) بدون ترک صفحه باز می‌کند.' },
            { name: 'Ask AI icon', description: 'دربارهٔ همین منبع مشخص از دستیار می‌پرسد.' },
            { name: 'Star icon', description: 'منبع را به Favourites اضافه یا از آن حذف می‌کند؛ Favourites در Overview فهرست می‌شود.' },
            { name: 'Environment dropdown', description: 'منبع را مستقیماً در همان ردیف به یک environment اختصاص می‌دهد. انتخاب Unassigned اختصاص را برمی‌دارد. این تغییر audit می‌شود.' },
          ],
        },
        {
          name: 'Resource side panel (پنل کناری منبع)',
          description: 'کشویی که با آیکون چشم باز می‌شود. همان پنل بین‌ماژولی است که در جاهای دیگر OpsDeck هم استفاده می‌شود و همان snapshot، timeline، تاریخچهٔ تغییرات و یادداشت‌های صفحه‌های کامل را می‌خواند، پس منبع حقیقت دومی وجود ندارد.',
          items: [
            { name: 'Header', description: 'نام، id، module و kind، نشان status، نشان environment و جزئیات وضعیت گزارش‌شده. دکمهٔ Open workspace شما را به منبع در ماژول خودش می‌برد.' },
            { name: 'Facts', description: 'module، kind، مکان (cluster، namespace، host)، زمان مشاهده، و labelهای آن به‌صورت جفت‌های key=value.' },
            { name: 'Recent events', description: 'حداکثر ۲۰ رویداد timeline که متنشان نام منبع را دارد.' },
            { name: 'Recorded changes', description: 'حداکثر ۲۰ تغییر ثبت‌شده برای id این منبع (status، image، replicas و مانند آن).' },
            { name: 'Investigation notes', description: 'یادداشت‌های محلی که برای این منبع ذخیره شده است.' },
            { name: 'Limitations', description: 'نکات ریز دربارهٔ چیزهایی که پنل نتوانسته تأیید کند، در صورت وجود.' },
            { name: 'Footer', description: 'Ask AI و Close.' },
          ],
        },
        {
          name: 'Pager (صفحه‌بندی)',
          description: 'دکمه‌های Previous و Next با عبارت "Page 2 of 5"، که فقط وقتی بیش از یک صفحه باشد دیده می‌شوند.',
        },
      ],
      tables: [
        {
          name: 'Unified resource inventory',
          columns: [
            { name: 'Resource', meaning: 'نام (لینک به فضای کاری بومی) و در زیر آن جزئیات وضعیت یا kind.', example: 'redis-cache · Up 3 hours (healthy)' },
            { name: 'Module', meaning: 'کدام ماژول آن را گزارش کرده است.', example: 'Docker' },
            { name: 'Kind', meaning: 'نوع منبع.', example: 'container' },
            { name: 'State', meaning: 'healthy، degraded، unhealthy، stopped یا unknown.', example: 'unhealthy' },
            { name: 'Environment', meaning: 'منوی کشویی قابل‌ویرایش با environment اختصاص‌داده‌شده.', example: 'Staging' },
            { name: 'Location', meaning: 'namespace، host یا cluster، یا یک خط تیره.', example: 'shop' },
            { name: '(actions)', meaning: 'دکمه‌های Inspect، Ask AI و favourite.', example: 'eye, sparkle, star' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن و بررسی یک کانتینر unhealthy',
        steps: [
          'ماژول Docker و state unhealthy را انتخاب کنید.',
          'مورد "api-gateway" را می‌بینید، با kind برابر container، state برابر unhealthy و location برابر host-1.',
          'روی آیکون چشم کلیک کنید. پنل جزئیات وضعیت "health check failing"، دو رویداد timeline دربارهٔ restartها و یک تغییر ثبت‌شدهٔ "image changed" از ۱ ساعت پیش را نشان می‌دهد.',
          'روی Open workspace کلیک کنید تا کانتینر را در Docker ببینید، یا آن را ستاره بزنید تا در Overview بماند.',
        ],
      },
      tips: [
        'تغییرهای environment که اینجا انجام می‌دهید بلافاصله روی شمارنده‌ها و فیلترهای environment اثر می‌گذارد.',
        'اگر ماژولی در فهرست نیست، بنر unavailable زیر جدول یا Source health در Overview را بررسی کنید.',
      ],
    },

    'intelligence/search': {
      title: 'Global search (جستجوی سراسری)',
      summary: 'منابع، رویدادهای timeline و تغییرات ثبت‌شده را در همهٔ فضاهای کاری یک‌جا جستجو کنید.',
      whenToUse: [
        'نام، namespace، host یا وضعیتی را یادتان هست ولی نمی‌دانید کجاست.',
        'می‌خواهید هر چیزی را که به یک کلمه مربوط است، مثلاً "payments"، در ماژول‌های مختلف ببینید.',
        'می‌خواهید یک جستجوی مفید را بعداً دوباره تکرار کنید.',
      ],
      howItWorks: [
        'یک عبارت بنویسید و Search را بزنید (یا Enter). backend فهرست یکپارچهٔ منابع، رویدادهای نگه‌داری‌شده و تغییرات ثبت‌شده را جستجو می‌کند. نتیجه‌ها خودکار به‌روز نمی‌شوند؛ برای اجرای دوباره دوباره Search را بزنید.',
        'منوی module جستجو را به یک ماژول محدود می‌کند. تا وقتی جستجو نکنید چیزی نمایش داده نمی‌شود.',
      ],
      parts: [
        {
          name: 'Search form (فرم جستجو)',
          items: [
            { name: 'Search box', description: 'نام، namespace، host، status یا module. مثلاً "payments" یا "crashloop".' },
            { name: 'All modules', description: 'جستجو را به یک ماژول محدود می‌کند.' },
            { name: 'Search', description: 'جستجو را اجرا می‌کند.' },
            { name: 'Save search', description: 'یک نام می‌پرسد و عبارت و فیلتر ماژول فعلی را ذخیره می‌کند.' },
          ],
        },
        {
          name: 'Saved searches (جستجوهای ذخیره‌شده)',
          description: 'ردیفی از chipها، یکی برای هر جستجوی ذخیره‌شده. کلیک روی یک chip عبارت را پر می‌کند و آن را اجرا می‌کند.',
        },
        {
          name: 'Result counters (شمارنده‌های نتیجه)',
          description: 'چهار کارت: Resources (با زمان صرف‌شده برای جستجو به ms)، Events، Changes و Actions (میان‌برهای ناوبری که با کلمه‌های شما جور هستند).',
        },
        {
          name: 'Action chips (chipهای عملیات)',
          description: 'میان‌بر به صفحه‌هایی که با عبارت جستجو جور هستند؛ مثلاً با نوشتن "backup" ممکن است لینکی به صفحهٔ backup پیشنهاد شود. هر chip ماژولی را که به آن می‌رسد نشان می‌دهد.',
        },
        {
          name: 'Resources, Events and Changes cards (کارت‌های منابع، رویدادها و تغییرات)',
          description: 'منابع در یک جدول نمایش داده می‌شوند (لینک منبع، module، state، environment). Events و Changes به‌صورت فهرست با زمان، نشان severity، عنوان، جزئیات و module نمایش داده می‌شوند. کارت‌های Events و Changes فقط وقتی ظاهر می‌شوند که چیزی جور شده باشد.',
        },
      ],
      example: {
        title: 'مثال: جستجوی "checkout"',
        steps: [
          'checkout را بنویسید، All modules را دست نزنید و Search را بزنید.',
          'شمارنده‌ها Resources 4، Events 7، Changes 2، Actions 0 را نشان می‌دهند.',
          'در Resources یک deployment در Kubernetes، دو pod و یک کانتینر Docker می‌بینید. در Changes مورد "image changed" را برای همان deployment می‌بینید.',
          'روی Save search کلیک کنید و نامش را "Checkout" بگذارید تا بعداً از chipها دوباره استفاده کنید.',
        ],
      },
      tips: [
        'جستجوهای ذخیره‌شده فیلتر ماژول را هم به خاطر می‌سپارند.',
        'اگر جستجو چیزی برنگرداند، کلمهٔ کوتاه‌تری امتحان کنید یا فیلتر ماژول را بردارید.',
      ],
    },

    'intelligence/timeline': {
      title: 'Unified timeline (خط زمانی یکپارچه)',
      summary: 'رویدادهای واقعی همهٔ ماژول‌ها در یک فهرست زمانی، از جدیدترین به قدیمی‌ترین: Docker، Kubernetes، فعالیت پایگاه‌داده، هشدارها، incidentها، تغییرهای شناسایی‌شده و اجراهای automation.',
      whenToUse: [
        'چیزی خراب شده و می‌خواهید بدانید در آن زمان در همهٔ سیستم‌ها چه اتفاقی افتاده است.',
        'می‌خواهید بررسی کنید یک automation اجرا شده یا یک هشدار firing شده است.',
      ],
      howItWorks: [
        'رویدادها همان لحظه‌ای که رخ می‌دهند از هر ماژول خوانده می‌شوند؛ هیچ چیز ساخته نمی‌شود. یک بازهٔ زمانی انتخاب کنید و در صورت نیاز با module، severity یا متن محدودش کنید؛ فهرست دوباره بارگذاری می‌شود.',
        'در این صفحه فهرست تا وقتی پنجره قابل‌مشاهده است هر ۴۵ ثانیه خودش را به‌روز می‌کند. ردیف‌ها ۵۰ تا ۵۰ تا صفحه‌بندی می‌شوند.',
      ],
      parts: [
        {
          name: 'Filter bar (نوار فیلتر)',
          items: [
            { name: 'Filter events', description: 'جستجوی متنی روی رویدادها.' },
            { name: 'Range', description: 'Last hour، 6 hours، 24 hours (پیش‌فرض)، 7 days یا 30 days.' },
            { name: 'All modules', description: 'فقط رویدادهای یک ماژول را نشان می‌دهد.' },
            { name: 'All severities', description: 'Info، Success، Warning، Error یا Critical.' },
            { name: 'Counter', description: 'تعداد کل رویدادها در این بازه.' },
          ],
        },
        {
          name: 'Module chips (chipهای ماژول)',
          description: 'نواری که نشان می‌دهد هر ماژول چند رویداد داشته، از بیشترین به کمترین.',
        },
        {
          name: 'Source warning (هشدار منبع)',
          description: 'اگر خواندن بعضی منبع‌ها ممکن نبوده باشد، یک بنر آن‌ها را فهرست می‌کند تا بدانید timeline ناقص است.',
        },
        {
          name: 'Event stream (جریان رویدادها)',
          description: 'جدول رویدادها. عنوان‌هایی که لینک دارند صفحهٔ ماژول مرتبط را باز می‌کنند.',
        },
        {
          name: 'Pager (صفحه‌بندی)',
          description: 'دکمه‌های Previous و Next با عبارت "Page 1 of 3" وقتی بیش از ۵۰ رویداد وجود دارد.',
        },
      ],
      tables: [
        {
          name: 'Event stream',
          columns: [
            { name: 'Time', meaning: 'تاریخ و ساعت دقیق، با عبارت "x ago" در زیر آن.', example: '13 Nov 14:02 / 6 minutes ago' },
            { name: 'Severity', meaning: 'info، success، warning، error یا critical.', example: 'error' },
            { name: 'Module', meaning: 'رویداد از کجا آمده است.', example: 'Kubernetes' },
            { name: 'Event', meaning: 'عنوان (در صورت وجود به‌صورت لینک) و جزئیات.', example: 'Pod api-7d9f restarted / OOMKilled' },
            { name: 'Resource', meaning: 'منبع درگیر، یا یک خط تیره.', example: 'api-7d9f' },
            { name: 'Tags', meaning: 'تگ‌های آزادی که به رویداد وصل شده‌اند.', example: 'automation, warning' },
          ],
        },
      ],
      example: {
        title: 'مثال: قبل از قطعی چه اتفاقی افتاد؟',
        steps: [
          'Range را روی Last 6 hours و Severity را روی Warning بگذارید.',
          'chipهای ماژول را نگاه کنید: Kubernetes بیشترین رویداد را دارد.',
          '"Pod api-7d9f restarted" را در ساعت 14:02 و "Automation run succeeded" را در 14:05 پیدا کنید.',
          'روی عنوان کلیک کنید تا pod در Kubernetes باز شود، یا از Root cause استفاده کنید تا فرضیه‌ها برای همان بازهٔ زمانی رتبه‌بندی شوند.',
        ],
      },
      tips: [
        'فیلتر severity دقیقاً همان severity انتخاب‌شده را انتخاب می‌کند، نه "این و بالاتر".',
        'بازهٔ کوتاه‌تر سریع‌تر بارگذاری می‌شود و در زمان incident خواندنش راحت‌تر است.',
      ],
    },

    'intelligence/changes': {
      title: 'Changes (تغییرات)',
      summary: 'چه چیزی نسبت به snapshot قبلی منابع شما ظاهر شده، ناپدید شده یا تغییر کرده است.',
      whenToUse: [
        'چیزی شروع به خراب‌شدن کرده و می‌خواهید بدانید درست قبل از آن چه تغییری رخ داده است.',
        'می‌خواهید مدرکی داشته باشید که یک deployment، image یا تعداد replica را عوض کرده است.',
      ],
      howItWorks: [
        'OpsDeck یک snapshot از همهٔ منابع ذخیره می‌کند و هر snapshot جدید را با قبلی مقایسه می‌کند. اولین snapshot فقط یک baseline است و رکورد تغییری تولید نمی‌کند؛ بنر "Baseline established" این را توضیح می‌دهد.',
        'شناسایی طبق زمان‌بندی و همچنین وقتی Detect now را بزنید اجرا می‌شود. صفحه هر ۴۵ ثانیه خودش را به‌روز می‌کند و وقتی تغییر تازه‌ای پیدا شود یک toast نشان می‌دهد. تا ۴۰۰ رکورد نگه‌داری‌شده نمایش داده می‌شود.',
        'انواع تغییری که ممکن است ببینید: discovered (منبع جدید)، removed، status، image، replicas و configuration.',
      ],
      parts: [
        {
          name: 'Baseline banner (بنر Baseline)',
          description: 'وقتی نمایش داده می‌شود که داده‌های ذخیره‌شده فقط همان snapshot اول باشند.',
        },
        {
          name: 'Filter bar (نوار فیلتر)',
          items: [
            { name: 'Filter changes', description: 'فیلتر متنی.' },
            { name: 'All modules', description: 'محدود کردن به یک ماژول.' },
            { name: 'Counter', description: 'تعداد رکوردهای تغییر نگه‌داری‌شده.' },
            { name: 'Detect now', description: 'یک snapshot تازه می‌گیرد و آن را با snapshot ذخیره‌شده مقایسه می‌کند. یک toast می‌گوید چند تغییر پیدا شد، یا "No changes since the last snapshot".' },
          ],
        },
        {
          name: 'Change history (تاریخچهٔ تغییرات)',
          description: 'جدول رکوردها، جدیدترین اول. لینک عنوان‌ها منبع مرتبط را باز می‌کند.',
        },
      ],
      tables: [
        {
          name: 'Change history',
          columns: [
            { name: 'Time', meaning: 'زمانی که تغییر شناسایی شد (لزوماً زمانی که اتفاق افتاده نیست).', example: '13 Nov 10:15 / 3 hours ago' },
            { name: 'Severity', meaning: 'تغییر چقدر مهم است.', example: 'warning' },
            { name: 'Module', meaning: 'ماژول منبع.', example: 'Docker' },
            { name: 'Kind', meaning: 'نوع تغییر.', example: 'image' },
            { name: 'Change', meaning: 'عنوان و جزئیات.', example: 'Image changed / nginx:1.25 to nginx:1.27' },
            { name: 'Resource', meaning: 'منبعی که تغییر کرده است.', example: 'web-1' },
          ],
        },
      ],
      example: {
        title: 'مثال: تأیید یک rollout',
        steps: [
          'بعد از یک deployment روی Detect now کلیک کنید.',
          'یک toast می‌گوید "2 change(s) detected".',
          'ماژول Kubernetes را فیلتر کنید. "replicas: 2 to 4" را برای deployment با نام api و "image changed" را برای همان deployment می‌بینید.',
        ],
      },
      tips: [
        'در نصب تازه، یک collection دیگر صبر کنید یا یک بار Detect now را بزنید تا چیزی برای مقایسه وجود داشته باشد.',
        'زمان‌ها، زمان شناسایی هستند؛ پس تغییری که بین دو snapshot رخ داده در شناسایی بعدی ثبت می‌شود.',
      ],
    },

    'intelligence/incidents': {
      title: 'Incidents (حادثه‌ها)',
      summary: 'فهرستی از incidentهای ذخیرهٔ observability، کنار منابعی که درگیرشان هستند، با یک میان‌بر برای بررسی هرکدام.',
      whenToUse: [
        'یک فهرست واحد از incidentهای باز و گذشته می‌خواهید، همراه با سرویس‌ها و منابع تحت‌تأثیر.',
        'می‌خواهید از یک incident بررسی root cause را شروع کنید.',
      ],
      howItWorks: [
        'incidentها توسط قانون‌های alert یا یک action در automation (Create incident) ساخته می‌شوند. هیچ چیز فقط برای نمایش تولید نمی‌شود. فهرست تا ۲۰۰ incident را بارگذاری می‌کند و با زدن Refresh به‌روز می‌شود.',
        'alertها، metricها، logها و traceهای مرتبط فقط وقتی به هم وصل می‌شوند که یک investigation را باز کنید.',
      ],
      parts: [
        {
          name: 'Top bar (نوار بالا)',
          items: [
            { name: 'Count', description: 'چند incident از ذخیرهٔ observability بارگذاری شده است.' },
            { name: 'Open observability incidents', description: 'مدیر کامل incident را در فضای کاری Observability باز می‌کند، جایی که می‌توانید acknowledge یا resolve کنید.' },
            { name: 'Investigate', description: 'صفحهٔ Root cause را باز می‌کند.' },
          ],
        },
        {
          name: 'Cross-module incidents table (جدول incidentهای بین‌ماژولی)',
          description: 'هر عنوان لینکی است که کشوی incident را باز می‌کند.',
          items: [
            { name: 'Ask AI icon', description: 'دربارهٔ این incident از دستیار می‌پرسد.' },
            { name: 'Investigate button', description: 'Root cause را با این incident از پیش انتخاب‌شده باز می‌کند.' },
          ],
        },
        {
          name: 'Incident drawer (کشوی incident)',
          description: 'از روی عنوان باز می‌شود. نشان‌های status و severity، خلاصه و این فکت‌ها را نشان می‌دهد: Created، Updated، Services، Resources و Assignee (یا unassigned). اگر incident timeline داشته باشد، ۱۲ مورد آخر فهرست می‌شود. دکمه‌های پایین: Close، Open in observability و Investigate.',
        },
      ],
      tables: [
        {
          name: 'Cross-module incidents',
          columns: [
            { name: 'Incident', meaning: 'عنوان (کشو را باز می‌کند) و در زیر آن خلاصه.', example: 'Checkout latency spike / p95 above 2 s' },
            { name: 'Severity', meaning: 'critical، major، minor، warning یا info.', example: 'critical' },
            { name: 'Status', meaning: 'open یا acknowledged (نارنجی/فیروزه‌ای)، resolved یا closed (سبز).', example: 'acknowledged' },
            { name: 'Services', meaning: 'حداکثر ۳ سرویس درگیر.', example: 'checkout, payments' },
            { name: 'Resources', meaning: 'حداکثر ۳ منبع درگیر.', example: 'checkout-7d9f, orders-db' },
            { name: 'Updated', meaning: 'زمان گذشته از آخرین به‌روزرسانی.', example: '12 minutes ago' },
            { name: '(actions)', meaning: 'Ask AI و Investigate.', example: '' },
          ],
        },
      ],
      example: {
        title: 'مثال: بررسی یک incident باز',
        steps: [
          '"Checkout latency spike" را با status برابر open و severity برابر critical پیدا کنید.',
          'روی عنوانش کلیک کنید تا خلاصه و timeline را در کشو بخوانید.',
          'روی Investigate کلیک کنید. صفحهٔ Root cause با همین incident انتخاب‌شده و یک بازهٔ ۶۰ دقیقه‌ای باز می‌شود.',
        ],
      },
      tips: [
        'این صفحه فقط‌خواندنی است. برای acknowledge، assign یا resolve کردن یک incident از مدیر incident در Observability استفاده کنید.',
        'فهرست خالی یعنی هنوز incidentی وجود ندارد، نه اینکه بارگذاری داده شکست خورده باشد (خطاها در یک بنر نشان داده می‌شوند).',
      ],
    },

    'intelligence/rca': {
      title: 'Root cause (علت ریشه‌ای)',
      summary: 'شواهد را دور یک alert، یک incident یا یک منبع جمع می‌کند و به شما fact، فرضیه‌های رتبه‌بندی‌شده و فهرستی صادقانه از چیزهایی که نتوانسته تأیید کند می‌دهد. هرگز ادعا نمی‌کند که علت ریشه‌ای تأیید شده است.',
      whenToUse: [
        'یک alert فعال شده یا یک incident باز شده و می‌خواهید به‌جای حدس‌زدن یک نقطهٔ شروع داشته باشید.',
        'یک سرویس کند است و می‌خواهید بدانید کدام metricها، logها، traceها یا تغییرات زودتر جابه‌جا شده‌اند.',
      ],
      howItWorks: [
        'OpsDeck بازهٔ انتخابی را با یک baseline هم‌طول قبل از آن مقایسه می‌کند. حرکت metricها، alertها، تغییرات ثبت‌شده، logها، traceها و منابع unhealthy را بررسی می‌کند و هر یافته را به یک فرضیه با امتیاز confidence تبدیل می‌کند.',
        'Confidence امتیازی سقف‌دار است که از شواهد پیداشده ساخته می‌شود (مثلاً فرضیهٔ metric با بزرگ‌تر شدن z-score و درصد تغییر قوی‌تر می‌شود). فرضیه‌ای با امتیاز ۶۵٪ یا بیشتر high (قرمز)، ۴۰٪ تا ۶۴٪ medium (نارنجی) و کمتر از ۴۰٪ low (خاکستری) برچسب می‌خورد.',
        'investigation فقط وقتی اجرا می‌شود که Investigate را بزنید؛ خودش به‌روز نمی‌شود.',
      ],
      parts: [
        {
          name: 'Investigation form (فرم investigation)',
          items: [
            { name: 'Subject', description: 'محدودهٔ منبع یا سرویس، Alert یا Incident.' },
            { name: 'Scope / Alert / Incident', description: 'برای scope نام یک سرویس، namespace، کانتینر یا host را تایپ می‌کنید. برای Alert یا Incident از یک فهرست انتخاب می‌کنید (alertهای حل‌نشده و incidentها که هنگام باز شدن صفحه بارگذاری می‌شوند).' },
            { name: 'Window', description: 'Last 15 minutes، hour، 3 hours، 6 hours یا 24 hours. این همان بازهٔ incident است؛ baseline قبل از آن طولی برابر دارد.' },
            { name: 'Broad scope', description: 'وقتی تیک بخورد، سری‌های metric بر اساس متن scope فیلتر نمی‌شوند. وقتی از آن استفاده کنید که کلمهٔ scope در labelهای metric نیست.' },
            { name: 'Investigate', description: 'تحلیل را اجرا می‌کند. تا وقتی کار می‌کند دکمه "Investigating..." را نشان می‌دهد.' },
            { name: 'Copy JSON', description: 'بعد از دریافت نتیجه ظاهر می‌شود. کل investigation را به‌صورت JSON کپی می‌کند.' },
          ],
        },
        {
          name: 'Report header (سربرگ گزارش)',
          description: 'عنوان subject، شروع و پایان بازه، طول baseline به دقیقه و مدت زمان تحلیل، همراه با نشانی برای نوع subject (manual، alert یا incident).',
        },
        {
          name: 'Hypotheses, not verdicts (فرضیه، نه حکم)',
          description: 'یک بنر با خلاصهٔ کوتاه بهترین توضیح، یا پیامی که می‌گوید هیچ توضیحی تولید نشده است.',
        },
        {
          name: 'Facts (فکت‌ها)',
          description: 'فقط مقدارهای اندازه‌گیری‌شده و رکوردهای ثبت‌شده.',
        },
        {
          name: 'Limitations (محدودیت‌ها)',
          description: 'چیزهایی که investigation نتوانسته تأیید کند، مثلاً نبود یک منبع log یا کم‌بودن نمونه‌ها. اگر همهٔ منبع‌ها داده برگردانده باشند، می‌گوید محدودیتی اعلام نشده است.',
        },
        {
          name: 'Ranked hypotheses (فرضیه‌های رتبه‌بندی‌شده)',
          description: 'کارت‌های شماره‌دار، قوی‌ترین اول. هر کدام یک عنوان، نشان برچسب، درصد و نوار confidence، فهرست نقطه‌ای شواهد و، در صورت وجود، Next steps را نشان می‌دهد.',
        },
        {
          name: 'Metric movement (حرکت metricها)',
          description: 'جدولی که بازهٔ incident را با baseline مقایسه می‌کند.',
        },
        {
          name: 'Affected resources (منابع تحت‌تأثیر)',
          description: 'منابع درگیر، با module، kind و status (حداکثر ۴۰).',
        },
        {
          name: 'Correlated timeline (timeline هم‌بسته)',
          description: 'رویدادها و تغییرات این بازه به ترتیب زمان، با نشان ماژول.',
        },
      ],
      tables: [
        {
          name: 'Metric movement',
          columns: [
            { name: 'Metric', meaning: 'برچسب metric و در زیر آن منبع.', example: 'Container memory / api-gateway' },
            { name: 'Before', meaning: 'مقدار در دورهٔ baseline.', example: '41' },
            { name: 'During', meaning: 'مقدار در بازهٔ incident.', example: '93' },
            { name: 'Delta', meaning: 'درصد تغییر از before به during.', example: '+127%' },
            { name: 'z-score', meaning: 'مقدار جدید چند انحراف معیار از baseline فاصله دارد. بزرگ‌تر یعنی جهشی غیرعادی‌تر.', example: '6.4' },
          ],
        },
      ],
      example: {
        title: 'مثال: بررسی یک alert حافظه',
        steps: [
          'Subject را روی Alert بگذارید و "Container memory high - api-gateway" را انتخاب کنید.',
          'Window را "Last hour" بگذارید و Investigate را بزنید.',
          'فرضیهٔ ۱: "Container memory rose sharply" با ۷۸٪ (high). شواهد: از 41 به 93 درصد، z-score برابر 6.4؛ و یک تغییر image ثبت‌شده ۲۰ دقیقه قبل‌تر.',
          'Next steps پیشنهاد می‌کند image جدید را بررسی کنید. Limitations می‌گوید هیچ trace‌ای در دسترس نبوده است.',
          'روی Copy JSON کلیک کنید تا نتیجه را به یک تیکت پیوست کنید.',
        ],
      },
      tips: [
        'فرضیه یک سرنخ برای بررسی است، نه علت تأییدشده.',
        'اگر چیزی به آستانهٔ شواهد نرسید، بازه را بزرگ‌تر کنید یا بررسی کنید collectorها در حال اجرا باشند.',
        'از یک ردیف incident یا کشوی incident هم می‌توانید با فرم از پیش پرشده به اینجا برسید.',
      ],
    },

    'intelligence/reports': {
      title: 'Reports (گزارش‌ها)',
      summary: 'از metricها، alertها، incidentها، logها و traceهای نگه‌داری‌شده برای یک دورهٔ انتخابی خلاصه تولید کنید.',
      whenToUse: [
        'برای یک جلسهٔ وضعیت به خلاصهٔ هفتهٔ گذشته نیاز دارید.',
        'می‌خواهید مقدارهای min، average، maximum و p95 را برای مجموعه‌ای از metricها ببینید.',
        'می‌خواهید داده‌های گزارش را به‌صورت JSON کپی کنید.',
      ],
      howItWorks: [
        'گزارش‌ها در main process از همان ذخیره‌هایی محاسبه می‌شوند که داشبوردها استفاده می‌کنند، پس با چیزی که جای دیگر می‌بینید یکی است. یک بازهٔ زمانی انتخاب کنید و روی یک نوع گزارش Generate را بزنید. چیزی از قبل پر نشده؛ گزارش خالی یعنی هیچ داده نگه‌داری‌شده‌ای جور نبوده است.',
        'نوع‌های گزارش را سرویس Observability فراهم می‌کند و شامل System performance، Server availability، Docker resource utilization، Kubernetes cluster health، Database performance، API availability، Application performance، Alert history و Incident history هستند.',
      ],
      parts: [
        {
          name: 'Filter bar (نوار فیلتر)',
          items: [
            { name: 'Range', description: 'Last hour، 24 hours (پیش‌فرض)، 7 days یا 30 days.' },
            { name: 'Observability reports', description: 'لینک به بخش کامل‌تر گزارش‌ها در Observability.' },
          ],
        },
        {
          name: 'Report types (نوع‌های گزارش)',
          description: 'برای هر نوع گزارش یک کاشی با نام، id و دکمهٔ Generate.',
        },
        {
          name: 'Report result (نتیجهٔ گزارش)',
          description: 'بعد از تولید گزارش ظاهر می‌شود. سربرگ عنوان، بازه و زمان تولید را همراه با دکمهٔ Copy JSON نشان می‌دهد. بدنه بسته به نوع گزارش از چند بخش ساخته شده است:',
          items: [
            { name: 'Metric section', description: 'کارتی با عنوان metric و یک جدول از سری‌ها (پایین‌تر ببینید).' },
            { name: 'Alerts in range / Incidents in range', description: 'جدول alertها (name، severity، state، resource) و incidentها (title، severity، status، resources).' },
            { name: 'Logs', description: 'تعداد رکوردها، مدت نگه‌داری به روز و تعداد به تفکیک level.' },
            { name: 'Traces', description: 'تعداد رکوردها، مدت نگه‌داری به روز و سرویس‌های اصلی.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Metric section',
          columns: [
            { name: 'Resource', meaning: 'سری‌ای که عددها به آن تعلق دارند.', example: 'host-1' },
            { name: 'Unit', meaning: 'واحد metric.', example: 'percent' },
            { name: 'Avg', meaning: 'میانگین در بازه.', example: '37' },
            { name: 'Min', meaning: 'کمترین مقدار.', example: '4' },
            { name: 'Max', meaning: 'بیشترین مقدار.', example: '96' },
            { name: 'p95', meaning: '۹۵٪ نمونه‌ها برابر یا کمتر از این مقدار بودند.', example: '81' },
            { name: 'Last', meaning: 'جدیدترین مقدار.', example: '35' },
          ],
        },
      ],
      example: {
        title: 'مثال: گزارش هفتگی سیستم',
        steps: [
          'Range را روی Last 7 days بگذارید.',
          'روی "System performance" دکمهٔ Generate را بزنید.',
          'کارت CPU را بخوانید: avg برابر 37، max برابر 96، p95 برابر 81؛ یعنی CPU معمولاً مشکلی ندارد و فقط جهش‌های کوتاه دارد.',
          'روی Copy JSON کلیک کنید تا داده‌ها را در یک سند بچسبانید.',
        ],
      },
      tips: [
        'منوی range هنگام زدن Generate اعمال می‌شود؛ پس اول آن را تغییر دهید.',
        'داده‌های کوتاه‌عمر (logها و traceها) با تنظیم نگه‌داری‌شان محدود می‌شوند و گزارش آن را نشان می‌دهد.',
      ],
    },

    'intelligence/environments': {
      title: 'Environments (محیط‌ها)',
      summary: 'منابع را با اختصاص‌های صریح، قانون‌ها و heuristicهای مبتنی بر توکن دقیق در محیط‌های Local، Development، Testing، Staging، Production یا محیط‌های خودتان گروه‌بندی کنید.',
      whenToUse: [
        'می‌خواهید سلامت را به تفکیک environment ببینید، نه به تفکیک ماژول.',
        'می‌خواهید Resources، Graph و Overview را بر اساس environment فیلتر کنید.',
        'می‌خواهید منابع production به‌طور خودکار از روی نام یا label شناسایی شوند.',
      ],
      howItWorks: [
        'environment یک منبع به این ترتیب تعیین می‌شود: اول اختصاص صریحی که خودتان داده‌اید، بعد قانون‌های شما (از بالا به پایین)، و بعد یک heuristic محافظه‌کارانه. heuristic فقط وقتی کار می‌کند که یک توکن دقیق مثل prod، stg، qa یا dev در namespace، labelها یا نام باشد. هر چیز دیگر تا وقتی آن را map نکنید unassigned می‌ماند.',
        'environmentهای داخلی را نمی‌شود حذف کرد؛ environmentهای سفارشی قابل ویرایش و حذف‌اند. حذف یک environment اختصاص‌ها و قانون‌هایی را که به آن اشاره دارند پاک می‌کند، نه خود منابع را. در Settings کلیدی برای خاموش‌کردن heuristicها هست.',
      ],
      parts: [
        {
          name: 'Top bar (نوار بالا)',
          items: [
            { name: 'Unassigned counter', description: 'چند منبع هیچ environment ندارند.' },
            { name: 'New environment', description: 'فرمی با Name، Tone (رنگ نشان) و Description باز می‌کند. environmentهای ذخیره‌شده افزوده می‌شوند.' },
            { name: 'New rule', description: 'فرم قانون را باز می‌کند (پایین‌تر ببینید).' },
          ],
        },
        {
          name: 'Environment cards (کارت‌های environment)',
          description: 'برای هر environment یک کارت: نشان نام، تعداد منابع، نشان "custom" اگر خودتان ساخته باشید، توضیح، نوار سبز برای سهم سالم‌ها و تعداد healthy، unhealthy و degraded. environmentهای سفارشی دکمه‌های Edit و Delete دارند. تا وقتی منبعی بدون environment هست، یک کارت اضافهٔ Unassigned هم ظاهر می‌شود.',
        },
        {
          name: 'Unassigned resources (منابع بدون environment)',
          description: '۸۰ منبع اول که environment ندارند. از منوی کشویی ستون Assign برای تعیین مستقیم یکی استفاده کنید.',
        },
        {
          name: 'Rules (قانون‌ها)',
          description: 'قانون‌ها قبل از heuristicها و به‌ترتیب اعمال می‌شوند و هر کدام دکمه‌های Edit و Delete دارند. فرم قانون این فیلدها را دارد:',
          items: [
            { name: 'Field', description: 'چه چیزی تطبیق داده شود: Name، Labels، Namespace، Host، Image یا Module.' },
            { name: 'Mode', description: 'Contains (متن ساده) یا Regular expression.' },
            { name: 'Pattern', description: 'متن یا regex، مثلاً prod.' },
            { name: 'Environment', description: 'منابع منطبق کدام environment را بگیرند.' },
            { name: 'Enabled', description: 'تیک را بردارید تا قانون بدون اعمال‌شدن نگه داشته شود.' },
          ],
        },
        {
          name: 'Heuristics banner (بنر heuristicها)',
          description: 'یادآوری می‌کند که استنباط محافظه‌کارانه است.',
        },
      ],
      tables: [
        {
          name: 'Rules',
          columns: [
            { name: 'Field', meaning: 'کدام ویژگی منبع بررسی می‌شود.', example: 'namespace' },
            { name: 'Mode', meaning: 'contains یا regex.', example: 'contains' },
            { name: 'Pattern', meaning: 'متن یا عبارتی که باید جور شود.', example: 'prod' },
            { name: 'Environment', meaning: 'environmentی که در صورت تطبیق اختصاص داده می‌شود.', example: 'Production' },
            { name: 'State', meaning: 'enabled (سبز) یا off.', example: 'enabled' },
          ],
        },
        {
          name: 'Unassigned resources',
          columns: [
            { name: 'Resource', meaning: 'نام (لینک).', example: 'billing-worker' },
            { name: 'Module', meaning: 'ماژول منبع.', example: 'Kubernetes' },
            { name: 'Kind', meaning: 'نوع منبع.', example: 'pod' },
            { name: 'State', meaning: 'وضعیت سلامت.', example: 'healthy' },
            { name: 'Assign', meaning: 'منوی کشویی برای تعیین environment.', example: 'Staging' },
          ],
        },
      ],
      example: {
        title: 'مثال: map کردن همهٔ namespaceهای production',
        steps: [
          'روی New rule کلیک کنید.',
          'Field را روی Namespace، Mode را روی Contains، Pattern را "prod-" و Environment را Production بگذارید و بعد Save rule را بزنید.',
          'عدد کارت Production بالا می‌رود و کارت Unassigned کوچک می‌شود.',
          'یک منبع باقی‌مانده را با دست در جدول Unassigned resources اختصاص دهید.',
        ],
      },
      tips: [
        'اختصاص‌های صریح همیشه بر قانون‌ها و heuristicها غلبه دارند.',
        'regex اشتباه معمول‌ترین دلیل جور نشدن یک قانون است؛ اول Contains را امتحان کنید.',
        'اختصاص‌ها، تغییر قانون‌ها و ویرایش environmentها در Audit trail نوشته می‌شوند.',
      ],
    },

    'intelligence/automation': {
      title: 'Automation (خودکارسازی)',
      summary: 'workflowهایی بسازید که طبق زمان‌بندی، وقتی شرط‌ها برقرارند، یا وقتی رویدادی رخ می‌دهد اجرا شوند. اول dry-run می‌شوند، برای هر کار مخرب approval لازم دارند، تعداد محدودی retry می‌شوند و کاملاً audit می‌شوند.',
      whenToUse: [
        'یک گزارش روزانه می‌خواهید یا وقتی یک metric از آستانه رد شد اعلان می‌خواهید.',
        'می‌خواهید وقتی چیزی خراب شد خودکار یک incident باز شود.',
        'می‌خواهید یک کانتینر، پروژهٔ Compose یا workload در Kubernetes را restart کنید، ولی فقط بعد از تأیید یک انسان.',
        'یک run منتظر approval دارید و باید آن را approve، reject یا cancel کنید.',
      ],
      howItWorks: [
        'یک automation (یک "rule" یا runbook) چهار بخش دارد: trigger (چه زمانی بررسی شود)، conditionهای اختیاری (همه باید برقرار باشند)، فهرستی از actionها (چه کاری انجام شود، تا ۱۲ تا) و حالت approval. موتور automationها را با یک تایمر بررسی می‌کند (پیش‌فرض هر ۱۵ ثانیه، در Settings تنظیم می‌شود) و وقتی Run را بزنید هم یکی را اجرا می‌کند.',
        'هر اجرا یک رکورد run با یک status می‌سازد. runها در تاریخچه‌ای محدود به ۵۰۰ مورد آخر نگه‌داری می‌شوند؛ این صفحه ۶۰ مورد آخر را در Recent runs و ۴۰ مورد آخر از آن‌ها را در جدول نشان می‌دهد. هر run در Audit trail هم نوشته می‌شود.',
        'مدل ایمنی: Dry run شرط‌ها را ارزیابی می‌کند و فهرست می‌کند چه اتفاقی می‌افتاد، اما هرگز actionی را اجرا نمی‌کند. چهار action مخرب (restart container، restart Compose project، restart یا scale برای Kubernetes workload) فقط داخل runی که approve شده اجرا می‌شوند. کوئری‌های پایگاه‌داده فقط‌خواندنی‌اند و اگر سرویس پایگاه‌داده SQL را مخرب تشخیص دهد رد می‌شوند. مرحله‌ای که به‌خاطر خطای شبکه یا timeout شکست بخورد یک بار دیگر امتحان می‌شود (در مجموع ۲ تلاش)؛ خطاهای دیگر بلافاصله fail می‌شوند.',
        'اگر automation را در Settings خاموش کنید، triggerهای schedule، condition و event متوقف می‌شوند و Run رد می‌شود. Dry runها همچنان کار می‌کنند. وقتی در این صفحه هستید و یک run به gate برسد، صفحه یک toast با عنوان "Automation waiting for approval" نشان می‌دهد.',
      ],
      parts: [
        {
          name: 'Stat cards (کارت‌های آمار)',
          description: 'چهار کارت.',
          items: [
            { name: 'Automations', description: 'چند automation وجود دارد و چند تا فعال‌اند.' },
            { name: 'Pending approval', description: 'runهایی که در approval gate منتظر شما هستند. وقتی بیشتر از صفر باشد نارنجی می‌شود.' },
            { name: 'Runs retained', description: 'چند run در تاریخچهٔ بارگذاری‌شده هست.' },
            { name: 'Engine', description: 'enabled یا paused (از تنظیم Automation enabled). triggerهای schedule و event فقط وقتی فعال است اجرا می‌شوند.' },
          ],
        },
        {
          name: 'Dry-run banner (بنر dry-run)',
          description: 'یادآوری می‌کند که dry run هرگز actionی را اجرا نمی‌کند و یک run واقعی هم وقتی automation approval بخواهد باز در approval gate می‌ایستد.',
        },
        {
          name: 'Waiting for approval (منتظر approval)',
          description: 'فقط وقتی ظاهر می‌شود که دست‌کم یک run در حالت pending باشد. هر ردیف automation، trigger، actionهای برنامه‌ریزی‌شده (actionهای مخرب با "(destructive)" برچسب می‌خورند) و زمان شروع را نشان می‌دهد. پیش از هر اقدام، همیشه actionهای برنامه‌ریزی‌شده را بخوانید.',
          items: [
            { name: 'Approve', description: 'تأیید می‌گیرد ("Approve and run") و بعد همهٔ actionهای برنامه‌ریزی‌شده را فوراً اجرا می‌کند. تأییدکننده ثبت می‌شود و یک ورودی audit با عنوان automation-approved نوشته می‌شود.' },
            { name: 'Reject', description: 'یک دلیل اختیاری می‌پرسد و run را با status برابر rejected تمام می‌کند. هیچ چیز اجرا نمی‌شود. ورودی audit نتیجهٔ denied دارد.' },
            { name: 'Cancel', description: 'run را با وضعیت cancelled و دلیل "Cancelled before approval" تمام می‌کند. وقتی از آن استفاده کنید که run دیگر مرتبط نیست.' },
          ],
        },
        {
          name: 'Automations list (rules and runbooks) (فهرست automationها)',
          description: 'جدول workflowها با دکمهٔ New automation در سربرگ کارت. دکمه‌های هر ردیف:',
          items: [
            { name: 'Edit', description: 'کشوی ویرایشگر را باز می‌کند (پایین‌تر ببینید).' },
            { name: 'Dry run', description: 'شرط‌ها را ارزیابی می‌کند و نشان می‌دهد چه چیزی اجرا می‌شد، بدون اجرای هیچ چیز. یک toast با عنوان "Dry run completed" و برنامه نشان می‌دهد، مثلاً "Would run 2 action(s): report, notify."' },
            { name: 'Run', description: 'بعد از تأیید، همین حالا اجرایش می‌کند: شرط‌ها با داده‌های زنده بررسی می‌شوند، بعد یا در approval gate می‌ایستد یا اجرا می‌شود. اجراهای دستی از trigger با نام "manual" استفاده می‌کنند.' },
            { name: 'Pause / Enable', description: 'triggerها را متوقف یا دوباره فعال می‌کند. automationی که paused است باز هم می‌تواند dry-run شود.' },
            { name: 'Delete', description: 'بعد از تأیید، تعریف workflow را حذف می‌کند. runهای گذشته در Audit trail می‌مانند.' },
          ],
        },
        {
          name: 'Editor: general fields (ویرایشگر: فیلدهای عمومی)',
          items: [
            { name: 'Name and Description', description: 'متن آزاد که در فهرست نمایش داده می‌شود.' },
            { name: 'Approval', description: 'Run without approval (never)، Ask before destructive actions (destructive: فقط وقتی متوقف می‌شود که فهرست شامل یک action از نوع restart یا scale باشد)، یا Ask before every run (always).' },
            { name: 'Cooldown (minutes)', description: 'کمترین فاصله بین runها برای triggerهای condition و event (پیش‌فرض 15، از 0 تا 10080). از اینکه شرطی که هنوز برقرار است بارها و بارها فعال شود جلوگیری می‌کند.' },
            { name: 'Enabled', description: 'اینکه triggerها فعال باشند یا نه.' },
          ],
        },
        {
          name: 'Editor: trigger (ویرایشگر: trigger)',
          items: [
            { name: 'Schedule', description: 'یا "Every (minutes)" (حداقل 5) یا "Or daily at" با زمانی به‌صورت HH:MM. فهرست آن را به‌صورت "Every 1 h" یا "Daily at 08:00" نشان می‌دهد.' },
            { name: 'Condition', description: 'وقتی اجرا می‌شود که همهٔ conditionهای زیر برقرار باشند. وقتی شرط برقرار می‌شود فعال می‌شود و تا وقتی برقرار می‌ماند cooldown را رعایت می‌کند.' },
            { name: 'Event', description: 'وقتی یک رویداد timeline منطبق ظاهر شود اجرا می‌شود. فیلدها: Modules (جداشده با کاما)، Event kinds (جداشده با کاما)، Minimum severity و Text match. در هر بررسی حداکثر ۳ رویداد منطبق تازه پردازش می‌شود و هر رویداد حداکثر یک run را فعال می‌کند.' },
          ],
        },
        {
          name: 'Editor: conditions (ویرایشگر: conditionها)',
          description: 'Add condition / آیکون سطل زباله. "All must match"؛ اگر هیچ condition‌ای نباشد، trigger مستقیم اجرا می‌شود. سه نوع:',
          items: [
            { name: 'Metric threshold', description: 'نام metric (از کاتالوگ observability)، Aggregation (avg، max، min، last، sum، count)، Operator (>، >=، <، <=، ==، !=)، Threshold و Window به دقیقه. مثال: avg مقدار system.cpu.usage > 85 در ۵ دقیقه.' },
            { name: 'Resource status count', description: 'Module، Kind اختیاری، Status (healthy، degraded، unhealthy، stopped، unknown)، Operator و Threshold. مثال: تعداد کانتینرهای docker با وضعیت unhealthy > 0.' },
            { name: 'Open incidents', description: 'Status (open یا acknowledged)، Severity (any، critical، major، minor، warning، info)، Operator و Threshold. مثال: incidentهای critical با وضعیت open >= 1.' },
          ],
        },
        {
          name: 'Editor: actions (ویرایشگر: actionها)',
          description: 'Add action / آیکون سطل زباله. actionها به ترتیب و یکی‌یکی اجرا می‌شوند. اگر یک action شکست بخورد ثبت می‌شود، بقیه باز هم اجرا می‌شوند و run با وضعیت failed تمام می‌شود. نُه نوع action:',
          items: [
            { name: 'Send notification', description: 'یک یا چند کانال انتخاب کنید (انتخاب‌نکردن یعنی همهٔ کانال‌های فعال)، یک severity (info، warning، error، critical) و یک پیام. پیام خالی یک متن پیش‌فرض با نام automation می‌فرستد.' },
            { name: 'Create incident', description: 'Title، Summary، Severity و Services (جداشده با کاما). شواهد conditionها پیوست می‌شود.' },
            { name: 'Generate report', description: 'Report id (پیش‌فرض system) و Hours (از 1 تا 720).' },
            { name: 'Run diagnostics', description: 'Target (system، docker، kubernetes، database) و، فقط برای database، connection id.' },
            { name: 'Run read-only SQL', description: 'Connection، Database، SQL (پیش‌فرض SELECT 1) و Row limit (از 1 تا 1000). دستورهایی که guard پایگاه‌داده مخرب بداند رد می‌شوند، پس این action نمی‌تواند داده را تغییر دهد.' },
            { name: 'Restart container (destructive)', description: 'یک کانتینر را از فهرست Docker انتخاب کنید. approval لازم دارد.' },
            { name: 'Restart Compose project (destructive)', description: 'یک پروژه انتخاب کنید. docker compose restart را برای همهٔ سرویس‌های آن اجرا می‌کند؛ به volumeها دست نمی‌زند. approval لازم دارد.' },
            { name: 'Restart Kubernetes workload (destructive)', description: 'یک Deployment، StatefulSet یا DaemonSet شناسایی‌شده را انتخاب کنید (یا وقتی cluster‌ای شناسایی نشده، kind، namespace و name را با دست بنویسید). یک rolling restart انجام می‌دهد. approval لازم دارد.' },
            { name: 'Scale Kubernetes workload (destructive)', description: 'همان انتخابگر برای Deploymentها و StatefulSetها، به‌علاوهٔ Replicas (از 0 تا 100). صفر همهٔ replicaها را متوقف می‌کند. approval لازم دارد.' },
          ],
        },
        {
          name: 'Recent runs (runهای اخیر)',
          description: 'تاریخچهٔ اجراها، جدیدترین اول، شامل dry runها، runهای skipped و runهایی که با schedule یا event فعال شده‌اند.',
        },
      ],
      tables: [
        {
          name: 'Automations table',
          description: 'یک ردیف برای هر workflow.',
          columns: [
            { name: 'Name', meaning: 'نام و توضیح.', example: 'Restart api on crash / Restarts the api pod when unhealthy' },
            { name: 'Trigger', meaning: 'چطور شروع می‌شود.', example: 'When conditions match' },
            { name: 'Conditions', meaning: 'تعداد conditionها.', example: '2' },
            { name: 'Actions', meaning: 'نوع actionها به ترتیب.', example: 'create-incident, k8s-restart' },
            { name: 'Approval', meaning: 'never (خاکستری)، destructive (نارنجی) یا always (قرمز).', example: 'destructive' },
            { name: 'State', meaning: 'enabled یا paused، با وضعیت و زمان آخرین run در زیر آن ("never" اگر هنوز اجرا نشده).', example: 'enabled / succeeded 2 hours ago' },
            { name: '(buttons)', meaning: 'Edit، Dry run، Run، Pause یا Enable، Delete.', example: '' },
          ],
        },
        {
          name: 'Waiting for approval table',
          columns: [
            { name: 'Automation', meaning: 'نام همراه با متن دلیل.', example: 'Restart api on crash / Waiting for explicit approval.' },
            { name: 'Trigger', meaning: 'چه چیزی run را شروع کرده: schedule، condition، event یا manual.', example: 'condition' },
            { name: 'Planned actions', meaning: 'چه چیزی بعد از approval اجرا می‌شود؛ مرحله‌های مخرب علامت‌گذاری می‌شوند.', example: 'k8s-restart (destructive)' },
            { name: 'Started', meaning: 'زمان گذشته از ساخته‌شدن run.', example: '4 minutes ago' },
            { name: '(buttons)', meaning: 'Approve، Reject، Cancel.', example: '' },
          ],
        },
        {
          name: 'Recent runs table',
          columns: [
            { name: 'Started', meaning: 'زمان شروع run.', example: '6 minutes ago' },
            { name: 'Automation', meaning: 'کدام workflow اجرا شده است.', example: 'Daily CPU report' },
            { name: 'Status', meaning: 'یک نشان، به‌علاوهٔ نشان فیروزه‌ای "dry run" برای dry runها. مقدارها: succeeded (سبز)، failed (قرمز)، pending-approval (نارنجی)، dry-run (فیروزه‌ای)، و خاکستری برای running، skipped، rejected و cancelled.', example: 'succeeded' },
            { name: 'Trigger', meaning: 'schedule، condition، event یا manual.', example: 'manual' },
            { name: 'Steps', meaning: 'یک ورودی برای هر action: "type: ok" یا خطا. اگر مرحله‌ای نباشد، دلیل نمایش داده می‌شود.', example: 'report: ok · notify: ok' },
            { name: 'Finished', meaning: 'زمان پایان، یا یک خط تیره تا وقتی هنوز در حال اجرا یا منتظر است.', example: '6 minutes ago' },
          ],
        },
        {
          name: 'Run status values',
          description: 'هر status چه معنایی دارد.',
          columns: [
            { name: 'running', meaning: 'actionها همین الان در حال اجرا هستند.', example: 'running' },
            { name: 'succeeded', meaning: 'همهٔ actionها بدون خطا تمام شدند.', example: 'succeeded' },
            { name: 'failed', meaning: 'دست‌کم یک action شکست خورد. ستون Steps نشان می‌دهد کدام و چرا.', example: 'k8s-restart: Choose a valid workload name.' },
            { name: 'skipped', meaning: 'شرط‌ها برقرار نبودند، پس چیزی اجرا نشد (دلیل: "Conditions are not met.").', example: 'skipped' },
            { name: 'dry-run', meaning: 'یک شبیه‌سازی که actionهای برنامه‌ریزی‌شده را بدون اجرا فهرست کرد.', example: 'Would run 2 action(s): report, notify.' },
            { name: 'pending-approval', meaning: 'در approval gate متوقف شده. به Approve، Reject یا Cancel نیاز دارد.', example: 'pending-approval' },
            { name: 'rejected', meaning: 'یک نفر run را reject کرد؛ چیزی اجرا نشد.', example: 'Rejected by the user.' },
            { name: 'cancelled', meaning: 'قبل از approval یا هنگام اجرا cancel شد.', example: 'Cancelled before approval.' },
          ],
        },
      ],
      example: {
        title: 'مثال: restart یک deployment بعد از approval',
        steps: [
          'روی New automation کلیک کنید. نامش را "Restart api on crash" بگذارید و Approval را روی "Ask before destructive actions" بگذارید. Cooldown را روی 15 رها کنید.',
          'Trigger: Condition. یک condition از نوع Resource status count اضافه کنید: Module برابر Kubernetes، Kind برابر pod، Status برابر unhealthy، Operator برابر >، Threshold برابر 0.',
          'action شمارهٔ ۱ را اضافه کنید: Create incident، با عنوان "api pods unhealthy" و severity برابر major. action شمارهٔ ۲: Restart Kubernetes workload را اضافه کنید و "Deployments · shop/api" را انتخاب کنید. بعد Save automation را بزنید.',
          'روی ردیف جدید Dry run را بزنید. toast می‌گوید "Would run 2 action(s): create-incident, k8s-restart" و Recent runs یک ردیف dry-run نشان می‌دهد. چیزی در cluster تغییر نکرده است.',
          'بعداً یک pod unhealthy می‌شود. موتور automation را اجرا می‌کند، شرط را برقرار می‌یابد و می‌ایستد: ردیفی در Waiting for approval با "create-incident, k8s-restart (destructive)" و یک toast هشدار ظاهر می‌شود.',
          'actionهای برنامه‌ریزی‌شده را بررسی کنید و روی Approve کلیک کنید، بعد "Approve and run" را تأیید کنید. incident ساخته می‌شود، deployment rollout می‌شود و run با وضعیت succeeded و Steps برابر "create-incident: ok · k8s-restart: ok" نشان داده می‌شود.',
          'Audit trail را باز کنید تا ورودی‌های automation-approval-requested، automation-approved، workload-restart و automation-run را ببینید.',
        ],
      },
      tips: [
        'بعد از ویرایش یک automation، به‌ویژه اگر action از نوع restart یا scale دارد، همیشه یک Dry run انجام دهید.',
        'اگر Approval روی "Run without approval" باشد و فهرست یک action مخرب داشته باشد، run برای انسان متوقف نمی‌شود؛ مرحلهٔ مخرب فقط با پیام "This action needs explicit approval before it can run" شکست می‌خورد. برای این actionها destructive یا always را انتخاب کنید.',
        'برای triggerهای condition و event از cooldown استفاده کنید تا یک مشکل پایدار جریانی از runها یا incidentها نسازد.',
        'یک schedule نمی‌تواند پرتکرارتر از هر ۵ دقیقه باشد.',
        'Approve فوراً اجرا می‌کند، از جمله مرحله‌های مخرب. اگر مطمئن نیستید Reject کنید؛ همیشه می‌توانید دوباره Run را بزنید.',
        'یک workflow را نمی‌شود هم‌زمان دو بار اجرا کرد؛ شروع دوم با پیام "This workflow is already running" رد می‌شود.',
        'runهای pending بدون timeout منتظر شما می‌مانند، پس کارت Pending approval را مرتب نگاه کنید.',
      ],
    },

    'intelligence/audit': {
      title: 'Audit trail (ردپای ممیزی)',
      summary: 'ثبتی زمانی از هر کار حساسی که OpsDeck از طریق لایهٔ intelligence انجام داده، تا ببینید چه کسی یا چه چیزی چیزی را تغییر داده و نتیجه چه بوده است.',
      whenToUse: [
        'می‌خواهید تأیید کنید یک automation واقعاً چیزی را restart کرده و چه کسی آن را approve کرده است.',
        'می‌خواهید تغییرهای environment، اعلان‌ها یا اجراهای شناسایی تغییر را مرور کنید.',
        'کسی می‌پرسد "OpsDeck دیشب چه کار کرد؟".',
      ],
      howItWorks: [
        'ورودی‌ها وقتی یک action رخ می‌دهد توسط main process نوشته می‌شوند، جدیدترین اول. ورودی‌های رایج: environment-assign، environment-save، environment-rule-save، environment-delete، automation-save، automation-delete، automation-approval-requested، automation-approved، automation-rejected، automation-run، container-restart، compose-restart، workload-restart، workload-scale، notification-send، incident-create و change-detected.',
        'صفحه هنگام باز شدن یا Refresh تا ۴۰۰ ورودی را بارگذاری می‌کند. فقط‌خواندنی است: اینجا نمی‌توانید ورودی‌ها را ویرایش یا حذف کنید.',
      ],
      parts: [
        {
          name: 'Filter bar (نوار فیلتر)',
          items: [
            { name: 'All modules', description: 'فقط ورودی‌های یک ماژول را نشان می‌دهد، مثلاً Docker یا Kubernetes.' },
            { name: 'Counter', description: 'تعداد ورودی‌های نمایش‌داده‌شده، جدیدترین اول.' },
          ],
        },
        {
          name: 'Audit trail table (جدول Audit trail)',
          description: 'یک ردیف برای هر action ممیزی‌شده.',
        },
      ],
      tables: [
        {
          name: 'Audit trail',
          columns: [
            { name: 'Time', meaning: 'زمان دقیق با عبارت "x ago" در زیر آن.', example: '13 Nov 14:05 / 8 minutes ago' },
            { name: 'Outcome', meaning: 'success (سبز)، failure (قرمز)، denied (نارنجی، مثلاً یک run ردشده) یا pending (فیروزه‌ای، مثلاً منتظر approval یا actionی که تازه شروع شده).', example: 'denied' },
            { name: 'Action', meaning: 'چه کاری انجام شد.', example: 'workload-restart' },
            { name: 'Module', meaning: 'ماژولی که روی آن عمل شد.', example: 'Kubernetes' },
            { name: 'Resource', meaning: 'هدف action.', example: 'deployments/shop/api' },
            { name: 'Detail', meaning: 'توضیح قابل‌فهم برای انسان.', example: 'Approved rolling restart via automation Restart api on crash' },
          ],
        },
      ],
      example: {
        title: 'مثال: ردگیری یک restart تأییدشده',
        steps: [
          'ماژول Kubernetes را فیلتر کنید.',
          'workload-restart را با outcome برابر pending و detail برابر "Approved rolling restart via automation Restart api on crash" پیدا کنید. این ورودی درست قبل از تلاش برای restart نوشته می‌شود.',
          'فیلتر را پاک کنید و چند ردیف اطراف آن را نگاه کنید تا automation-approved (چه کسی approve کرده) و automation-run با outcome برابر success را ببینید.',
        ],
      },
      tips: [
        'outcome برابر "pending" روی actionای مثل container-restart یعنی ورودی هنگام شروع action نوشته شده؛ نتیجهٔ run در ورودی automation-run متناظر است.',
        'حذف یک automation ورودی‌های audit آن را حذف نمی‌کند.',
      ],
    },

    'intelligence/settings': {
      title: 'Settings (تنظیمات)',
      summary: 'ترجیحات لایهٔ intelligence: اینکه automation اجرا شود یا نه، هر چند وقت بررسی کند، و اینکه environment از روی نام‌ها حدس زده شود یا نه. همچنین محل ذخیره و سلامت داده‌های intelligence را نشان می‌دهد.',
      whenToUse: [
        'می‌خواهید همهٔ automationها را یک‌جا متوقف کنید، مثلاً هنگام maintenance.',
        'می‌خواهید موتور automation بیشتر یا کمتر بررسی کند.',
        'می‌خواهید حدس‌زدن environment را خاموش کنید.',
        'می‌خواهید بدانید داده کجا ذخیره می‌شود یا چرا یک refresh شکست خورده است.',
      ],
      howItWorks: [
        'تنظیمات توسط main process ذخیره می‌شوند، نه در مرورگر. تغییرات فقط بعد از زدن Save settings اعمال می‌شوند. کارت سمت راست وضعیت فقط‌خواندنی است که هر بار صفحه را باز یا Refresh کنید بارگذاری می‌شود.',
      ],
      parts: [
        {
          name: 'Collection and automation card (کارت collection و automation)',
          items: [
            { name: 'Automation enabled', description: 'وقتی خاموش باشد، triggerهای schedule و condition اجرا نمی‌شوند و Run دستی رد می‌شود. dry runهای دستی همچنان کار می‌کنند.' },
            { name: 'Automation check interval (seconds)', description: 'موتور هر چند وقت یک بار دنبال automationهای سررسیدشده می‌گردد. مقدار مجاز 5 تا 3600، پیش‌فرض 15. فاصلهٔ کوتاه‌تر سریع‌تر واکنش نشان می‌دهد ولی بیشتر بررسی می‌کند.' },
            { name: 'Use environment heuristics', description: 'اجازه می‌دهد environment از روی توکن‌های دقیق (prod، stg، qa، dev و مشابه آن‌ها) استنباط شود. اختصاص‌های صریح و قانون‌ها همیشه برنده‌اند.' },
            { name: 'Save settings', description: 'سه مقدار را ذخیره می‌کند.' },
          ],
        },
        {
          name: 'Storage and status card (کارت ذخیره‌سازی و وضعیت)',
          description: 'فکت‌های فقط‌خواندنی.',
          items: [
            { name: 'Data file', description: 'مسیر ذخیرهٔ intelligence روی دیسک.' },
            { name: 'Loaded', description: 'yes (سبز) یا no (قرمز)؛ no یعنی ذخیره قابل خواندن نبوده است.' },
            { name: 'Last refresh', description: 'آخرین بار که منابع جمع‌آوری شدند، چند منبع پیدا شد و چقدر طول کشید، مثلاً "13 Nov 14:00 · 132 resources · 840 ms". قبل از اولین refresh عبارت "Not run yet" را نشان می‌دهد.' },
            { name: 'Last error', description: 'آخرین خطای collection، یا یک خط تیره.' },
            { name: 'Automation engine', description: 'enabled یا disabled.' },
          ],
        },
        {
          name: 'Compatibility banner (بنر سازگاری)',
          description: 'توضیح می‌دهد که ذخیرهٔ intelligence یک فایل JSON جداگانه و مختص مالک است. داده‌های موجود Docker، Kubernetes، پایگاه‌داده و observability دست‌نخورده می‌مانند و Intelligence هرگز رکوردهای آن‌ها را حذف نمی‌کند.',
        },
      ],
      example: {
        title: 'مثال: متوقف کردن همهٔ automationها برای maintenance',
        steps: [
          'تیک Automation enabled را بردارید و Save settings را بزنید.',
          'در صفحهٔ Automation حالا کارت Engine عبارت paused را نشان می‌دهد.',
          'بعد از maintenance دوباره تیک را بزنید و ذخیره کنید. automationها در بررسی بعدی‌شان از سر گرفته می‌شوند.',
        ],
      },
      tips: [
        'متوقف‌کردن از اینجا سریع‌تر از متوقف‌کردن تک‌تک automationهاست و وضعیت enabled خود آن‌ها را تغییر نمی‌دهد.',
        'اگر Last error مدام پیامی نشان می‌دهد، Source health در Overview را باز کنید تا ببینید کدام collector مشکل دارد.',
      ],
    },
  });
})();
