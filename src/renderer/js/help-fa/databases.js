'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.helpFa = OD.helpFa || {};

  const SHARED_ASK_AI = {
    name: 'Ask AI',
    description: 'دستیار هوش مصنوعی را با اطلاعات زنده از صفحه‌ای که در آن هستید (و اتصال انتخاب‌شده) باز می‌کند تا درباره آنچه می‌بینید سؤال بپرسید. فقط وقتی نمایش داده می‌شود که قابلیت AI در دسترس باشد.',
  };

  Object.assign(OD.helpFa, {
    'databases/dashboard': {
      title: 'Dashboard (داشبورد)',
      summary: 'نمایی یک‌صفحه‌ای از اتصال‌های دیتابیس شما، دیتابیس‌هایی که OpsDeck روی این دستگاه پیدا کرده (Docker، سرویس‌های محلی، Kubernetes) و جدیدترین فعالیت‌های دیتابیس.',
      whenToUse: [
        'تازه بخش Databases را باز کرده‌اید و می‌خواهید ببینید چه چیزی متصل است و چه چیزی سالم است.',
        'می‌خواهید بدانید کدام دیتابیس‌ها روی این دستگاه در حال اجرا هستند که هنوز اضافه‌شان نکرده‌اید.',
        'می‌خواهید سریع ببینید اخیراً چه کارهایی انجام شده است (اتصال‌ها، queryها، تغییرات schema).',
      ],
      howItWorks: [
        'اتصال‌های ذخیره‌شده از پروفایل‌هایی می‌آیند که روی همین کامپیوتر نگهداری می‌شوند (بخش Connections را ببینید). نتایج Discovery از یک اسکن زنده از Docker، سرویس‌های محلی و context انتخاب‌شده Kubernetes به دست می‌آید. اسکن هنگام باز کردن صفحه اجرا می‌شود و اگر زود برگردید، چند ثانیه از نتیجه قبلی استفاده می‌شود. برای اسکن تازه روی Discover بزنید.',
        'عبارت "Connected" یعنی OpsDeck همین حالا یک session باز به آن دیتابیس در همین برنامه دارد. session‌ها در لحظه نیاز باز می‌شوند، یعنی وقتی مرور می‌کنید، query می‌زنید یا Connect را می‌زنید، و session‌های بی‌استفاده بعد از مدتی خودکار بسته می‌شوند.',
        'هیچ چیزی در این صفحه ساختگی نیست: همه اعداد مستقیماً از سرویس دیتابیس داخل برنامه خوانده می‌شوند.',
      ],
      parts: [
        {
          name: 'Page header buttons (دکمه‌های بالای صفحه)',
          description: 'عملیاتی که در بالا سمت راست صفحه هستند.',
          items: [
            { name: 'Discover', description: 'Docker، سرویس‌های محلی و Kubernetes را دوباره اسکن می‌کند. یک toast می‌گوید در هر مکان چند دیتابیس پیدا شد.' },
            { name: 'New connection', description: 'فرم اتصال (یک drawer کناری) را برای افزودن پروفایل دیتابیس باز می‌کند.' },
            { name: 'Refresh', description: 'داده‌های صفحه را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Credential storage banner (بنر ذخیره اعتبارنامه‌ها)',
          description: 'بنری که می‌گوید رمزعبورها چگونه محافظت می‌شوند. سبز: "Credentials protected by the OS keyring" (از keyring سیستم‌عامل استفاده می‌شود). زرد: "Credentials encrypted with AES-256-GCM" یعنی keyring پیدا نشده و OpsDeck از فایل کلید رمزگذاری‌شده خودش با دسترسی فقط برای مالک استفاده می‌کند. در هر دو حالت، رمزعبورها هرگز به صفحه‌ای که می‌بینید نمی‌رسند.',
        },
        {
          name: 'Summary cards (کارت‌های خلاصه)',
          description: 'چهار کارت در بالای صفحه.',
          items: [
            { name: 'Connections', description: 'تعداد پروفایل‌های اتصال ذخیره‌شده، با تعداد favoriteها در زیر آن (مثلاً "5 favorites").' },
            { name: 'Connected now', description: 'تعداد session‌های باز از کل پروفایل‌ها، مثلاً 2/6. یادداشت زیر آن "Live sessions in this window" یا "No open sessions" را نشان می‌دهد.' },
            { name: 'Engines available', description: 'تعداد engineهایی که OpsDeck واقعاً می‌تواند به آن‌ها وصل شود (PostgreSQL, MySQL, MariaDB, SQLite, MongoDB, Redis, Elasticsearch, OpenSearch). یادداشت زیر آن نشان می‌دهد چند engine دیگر برنامه‌ریزی شده‌اند اما هنوز قابل استفاده نیستند.' },
            { name: 'Discovered databases', description: 'مجموع دیتابیس‌های پیداشده با Discovery، به شکل "3 Docker, 1 local, 0 Kubernetes". تا پایان اولین اسکن یک خط تیره و "Scanning..." نشان می‌دهد.' },
          ],
        },
        {
          name: 'Discovery',
          description: 'سه کارت قابل کلیک، هرکدام برای Docker، Local services و Kubernetes. هر کارت تعداد دیتابیس‌های پیداشده و عبارت "N reachable, M not reachable" را نشان می‌دهد. روی کارت کلیک کنید تا صفحه‌اش باز شود (Docker databases, Local databases, Kubernetes databases). اگر منبعی قابل اسکن نباشد (مثلاً Docker اجرا نیست)، کارت عبارت "unavailable" را همراه دلیلش نشان می‌دهد.',
        },
        {
          name: 'Connection health (سلامت اتصال‌ها)',
          description: 'جدولی از حداکثر 10 اتصال ذخیره‌شده همراه با وضعیتشان. روی لینک "All connections" کلیک کنید تا فهرست کامل باز شود.',
          items: [
            { name: 'Connect / Disconnect (row button)', description: 'برای آن اتصال یک session باز یا بسته می‌کند.' },
            { name: 'Performance (row button)', description: 'به صفحه Performance همان اتصال می‌رود.' },
            { name: 'Connection name link', description: 'آن اتصال را در Explorer باز می‌کند.' },
          ],
        },
        {
          name: 'Recent activity (فعالیت‌های اخیر)',
          description: '6 ورودی آخر Activity log (ستون‌های When, Operation, Connection, Message). badgeهای سبز موفقیت، زرد هشدار و قرمز شکست را نشان می‌دهند. "Open log" شما را به Activity log کامل می‌برد.',
        },
        {
          name: 'Last connected line (خط آخرین اتصال‌ها)',
          description: 'یک خط کوچک در پایین صفحه که اتصال‌هایی را که اخیراً باز کرده‌اید فهرست می‌کند (حداکثر 5 مورد). روی یک نام کلیک کنید تا آن را بررسی کنید. اگر هرگز متصل نشده باشید، این خط پنهان است.',
        },
      ],
      tables: [
        {
          name: 'Connection health table',
          columns: [
            { name: 'Connection', meaning: 'نام پروفایل ذخیره‌شده. برای بررسی آن کلیک کنید.', example: 'shop-db' },
            { name: 'Engine', meaning: 'نوع دیتابیس. badge خاکستری "planned" یعنی engine شناخته می‌شود اما هنوز نمی‌توان به آن وصل شد.', example: 'PostgreSQL' },
            { name: 'Status', meaning: 'connected (سبز): session باز است. error (قرمز): آخرین تلاش ناموفق بود. idle (خاکستری): فعلاً session بازی وجود ندارد.', example: 'connected' },
            { name: 'Last connected', meaning: 'مدت زمانی که از آخرین اتصال موفق گذشته است، یا "never".', example: '12 minutes ago' },
          ],
        },
        {
          name: 'Recent activity table',
          columns: [
            { name: 'When', meaning: 'زمان نسبی. با نگه داشتن ماوس، تاریخ و ساعت دقیق دیده می‌شود.', example: '3 minutes ago' },
            { name: 'Operation', meaning: 'نوع عملیات، با رنگی که نتیجه را نشان می‌دهد.', example: 'query (green)' },
            { name: 'Connection', meaning: 'عملیات روی کدام اتصال اجرا شده است.', example: 'shop-db' },
            { name: 'Message', meaning: 'توضیح کوتاه درباره آنچه رخ داده است.', example: 'SELECT returned 25 rows' },
          ],
        },
      ],
      example: {
        title: 'مثال: بررسی وضعیت بعد از راه‌اندازی Docker',
        steps: [
          'به Databases > Dashboard بروید.',
          'به کارت "Discovered databases" نگاه کنید: عبارت "1 Docker, 0 local, 0 Kubernetes" را نشان می‌دهد.',
          'روی کارت Docker کلیک کنید تا صفحه Docker databases باز شود و به container جدید وصل شوید.',
          'به Dashboard برگردید: حالا "Connected now" مقدار 1/1 را نشان می‌دهد و اتصال یک badge سبز "connected" دارد.',
        ],
      },
      tips: [
        'Discovery فقط دیتابیس‌ها را تشخیص می‌دهد. خودش هرگز پروفایل نمی‌سازد و رمزعبور حدس نمی‌زند.',
        'اگر کارتی "unavailable" نشان داد، صفحه‌اش را باز کنید: دلیل را توضیح می‌دهد (مثلاً Docker نصب نیست یا هیچ context در Kubernetes انتخاب نشده است).',
        'داشبورد فقط 10 اتصال اول را فهرست می‌کند. برای فهرست کامل از Connections استفاده کنید.',
      ],
    },

    'databases/connections': {
      title: 'Connections (اتصال‌ها)',
      summary: 'پروفایل‌های ذخیره‌شده‌ای را که به OpsDeck می‌گویند چطور به هر دیتابیس برسد بسازید، ویرایش کنید، گروه‌بندی کنید، تست کنید، import و export کنید.',
      whenToUse: [
        'می‌خواهید یک دیتابیس جدید (محلی، Docker، Kubernetes یا remote) اضافه کنید.',
        'باید host، port، رمزعبور یا تنظیم TLS را عوض کنید.',
        'می‌خواهید یک اتصال را read-only کنید تا کسی اشتباهی روی آن چیزی ننویسد.',
        'می‌خواهید فهرست اتصال‌هایتان را به کامپیوتر دیگری منتقل کنید یا با همکارتان به اشتراک بگذارید.',
      ],
      howItWorks: [
        'اتصال فقط یک پروفایل ذخیره‌شده است (engine، host، port، user، گزینه‌ها). ذخیره کردن پروفایل، session باز نمی‌کند. وقتی خواستید از آن استفاده کنید، Connect را بزنید (یا فقط Explorer یا SQL editor را باز کنید).',
        'پروفایل‌ها روی همین کامپیوتر ذخیره می‌شوند. رمزعبورها توسط برنامه رمزگذاری می‌شوند و دیگر هرگز نمایش داده نمی‌شوند: وقتی پروفایلی را ویرایش می‌کنید، کنار Password یک badge با عنوان "stored" می‌آید و اگر فیلد را خالی بگذارید، رمزعبور فعلی حفظ می‌شود.',
        'اتصال‌ها بر اساس فیلد Group (یا "Ungrouped") در کارت‌های جداگانه برای هر گروه نمایش داده می‌شوند. favoriteها همچنین در یک نوار بالای صفحه سنجاق می‌شوند تا با یک کلیک به Explorer برسید.',
        'engineهای پشتیبانی‌شده: PostgreSQL، MySQL، MariaDB، SQLite، MongoDB، Redis، Elasticsearch و OpenSearch. engineهای دیگر در فرم با عنوان "planned" فهرست می‌شوند اما قابل انتخاب نیستند.',
      ],
      parts: [
        {
          name: 'Page header buttons (دکمه‌های بالای صفحه)',
          items: [
            { name: 'Import', description: 'پروفایل‌های اتصال را از یک فایل export بارگذاری می‌کند. toast نتیجه می‌گوید چند پروفایل ساخته شد و چند تا نادیده گرفته شد. رمزعبورها هرگز در export نیستند، پس باید دوباره واردشان کنید.' },
            { name: 'Export', description: 'همه پروفایل‌ها را در یک فایل ذخیره می‌کند. toast تعداد پروفایل‌ها را تأیید می‌کند و می‌گوید هیچ secret ای همراهش نیست.' },
            { name: 'New connection', description: 'فرم اتصال را باز می‌کند.' },
            { name: 'Refresh', description: 'فهرست را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Favorites bar (نوار علاقه‌مندی‌ها)',
          description: 'فقط وقتی نمایش داده می‌شود که حداقل یک اتصال ستاره‌دار باشد. هر chip نام اتصال و engine را نشان می‌دهد و با کلیک روی آن، Explorer روی همان اتصال باز می‌شود.',
        },
        {
          name: 'Group cards (کارت‌های گروه)',
          description: 'یک کارت برای هر گروه، با نام گروه و تعداد اتصال‌های داخل آن. هر کارت یک جدول از اتصال‌هایش دارد.',
          items: [
            { name: 'Star button (next to the name)', description: 'اتصال را به favoriteها اضافه یا از آن‌ها حذف می‌کند.' },
            { name: 'Name link', description: 'فرم ویرایش آن اتصال را باز می‌کند.' },
            { name: 'Connect / Disconnect', description: 'یک session باز یا بسته می‌کند. هنگام اتصال، toast نسخه سرور را نشان می‌دهد و اگر شکست بخورد، خطا را.' },
            { name: 'Diagnostics', description: 'به صفحه Diagnostics این اتصال می‌رود تا بررسی‌های مرحله‌به‌مرحله را اجرا کنید.' },
            { name: 'Edit connection', description: 'فرم ویرایش را باز می‌کند.' },
            { name: 'Duplicate', description: 'یک کپی از پروفایل می‌سازد (برای اشاره به دیتابیس دیگری روی همان سرور کاربردی است).' },
            { name: 'Delete connection', description: 'تأیید می‌گیرد و سپس پروفایل و رمزعبور رمزگذاری‌شده‌اش را حذف می‌کند. خود دیتابیس دست‌نخورده می‌ماند.' },
          ],
        },
        {
          name: 'Connection form (side drawer)',
          description: 'با New connection یا با ویرایش یک ردیف باز می‌شود. فیلدها با engine تغییر می‌کنند: برای SQLite به جای host و port یک انتخاب‌گر فایل نمایش داده می‌شود.',
          items: [
            { name: 'Connection name', description: 'برچسبی که خودتان انتخاب می‌کنید. برای ذخیره کردن الزامی است.' },
            { name: 'Engine', description: 'نوع دیتابیس. با انتخاب آن، port پیش‌فرضش پر می‌شود (5432 برای PostgreSQL، 3306 برای MySQL/MariaDB، 27017 برای MongoDB، 6379 برای Redis، 9200 برای Elasticsearch/OpenSearch). engineهای planned خاکستری هستند.' },
            { name: 'Host and Port', description: 'جایی که سرور روی آن گوش می‌دهد، مثلاً 127.0.0.1 و 5432.' },
            { name: 'SQLite file (with Browse)', description: 'مسیر فایل .sqlite برای اتصال‌های SQLite. Browse یک انتخاب‌گر فایل باز می‌کند و اگر نام اتصال خالی باشد، نام فایل را به عنوان نام اتصال می‌گذارد.' },
            { name: 'Username and Password', description: 'هر دو اختیاری هستند (Redis یا SQLite اغلب به هیچ‌کدام نیاز ندارند). Password رمزگذاری‌شده ذخیره می‌شود، نه به صورت متن ساده.' },
            { name: 'Default database', description: 'دیتابیسی که هنگام باز کردن Explorer یا SQL editor ابتدا از آن استفاده می‌شود.' },
            { name: 'Group', description: 'متن آزاد برای گروه‌بندی اتصال‌ها، مثلاً "production". اتصال‌هایی که از یک پروژه Compose ساخته می‌شوند از نام پروژه استفاده می‌کنند.' },
            { name: 'TLS mode', description: 'disable, allow, prefer, require, verify-ca یا verify-full. برای سرورهای remote از require یا verify-full استفاده کنید.' },
            { name: 'Connection timeout (ms)', description: 'چقدر صبر کند تا منصرف شود. از 1000 تا 60000، پیش‌فرض 10000.' },
            { name: 'Pool size', description: 'حداکثر تعداد اتصال همزمانی که OpsDeck به این دیتابیس باز می‌کند (1 تا 50، پیش‌فرض 5).' },
            { name: 'Advanced options', description: 'گزینه‌های اضافی driver که به شکل key=value; key2=value2 نوشته می‌شوند.' },
            { name: 'Read-only profile', description: 'دستورهای نوشتن را که از OpsDeck روی این اتصال اجرا می‌شوند مسدود می‌کند. سپس یک badge با عنوان "read-only" در جدول نمایش داده می‌شود.' },
            { name: 'Favorite', description: 'اتصال را به نوار Favorites سنجاق می‌کند.' },
            { name: 'Validate TLS certificates', description: 'به صورت پیش‌فرض روشن است. فقط برای سرورهایی با گواهی self-signed که به آن‌ها اعتماد دارید خاموشش کنید.' },
            { name: 'Test connection', description: 'با مقادیر فعلی فرم و بدون ذخیره کردن تلاش می‌کند وصل شود. toast نسخه سرور و زمان پاسخ را نشان می‌دهد، یا خطا را.' },
            { name: 'Create connection / Save changes', description: 'پروفایل را ذخیره می‌کند. اگر نام خالی باشد با یک پیام خطا ناموفق می‌شود.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Connections table (one per group)',
          columns: [
            { name: 'Name', meaning: 'نام پروفایل، همراه با یک ستاره برای favorite کردن.', example: 'shop-db' },
            { name: 'Engine', meaning: 'badge نوع دیتابیس.', example: 'PostgreSQL' },
            { name: 'Target', meaning: 'host و port، یا مسیر فایل برای SQLite.', example: '127.0.0.1:5432' },
            { name: 'Source', meaning: 'پروفایل چگونه ساخته شده است: manual (توسط خودتان تایپ شده)، یا docker، compose، kubernetes، local وقتی از نتیجه discovery ساخته شده باشد.', example: 'compose' },
            { name: 'Status', meaning: 'connected، error یا idle، و اگر پروفایل نوشتن را مسدود کند یک badge زرد "read-only".', example: 'idle + read-only' },
          ],
        },
      ],
      example: {
        title: 'مثال: افزودن یک PostgreSQL محلی',
        steps: [
          'روی New connection کلیک کنید.',
          'نام "Local Postgres" را بنویسید و Engine را روی PostgreSQL نگه دارید (port به 5432 تغییر می‌کند).',
          'Host را 127.0.0.1 بگذارید، Username را "postgres" وارد کنید، رمزعبور را بنویسید و Default database را "postgres" بگذارید.',
          'روی Test connection کلیک کنید. منتظر toast سبز همراه با نسخه سرور بمانید، مثلاً "PostgreSQL 16.2 - 14 ms".',
          'روی Create connection کلیک کنید. پروفایل در کارت "Ungrouped" با وضعیت idle ظاهر می‌شود.',
          'روی دکمه play (Connect) کلیک کنید و سپس Explorer را برای مرور آن باز کنید.',
        ],
      },
      tips: [
        'برای دیتابیس‌های production گزینه "Read-only profile" را فعال کنید. در این صورت خود OpsDeck دستورهای نوشتن را رد می‌کند.',
        'فایل‌های export هرگز رمزعبور ندارند. بعد از import، هر پروفایل را ویرایش کنید و رمزعبورش را دوباره وارد کنید.',
        'حذف یک پروفایل هرگز داده‌ای را در دیتابیس پاک نمی‌کند.',
        'اگر اتصال شکست خورد، با Diagnostics ببینید کدام مرحله (reachability، TLS، login، permissions) مشکل دارد.',
      ],
    },

    'databases/explorer': {
      title: 'Database explorer (کاوشگر دیتابیس)',
      summary: 'ساختار و محتوای یک دیتابیس متصل را مرور کنید: schemaها، جدول‌ها (tables)، viewها، indexها، collectionها، indicesها یا کلیدهای Redis، همراه با پیش‌نمایش داده‌ها.',
      whenToUse: [
        'می‌خواهید ببینید چه جدول‌ها یا collectionهایی وجود دارند و چقدر بزرگ هستند.',
        'می‌خواهید بدون نوشتن query، نگاهی سریع به چند ردیف اول یک جدول بیندازید.',
        'می‌خواهید زمان انقضای یک کلید Redis را ببینید یا تغییر دهید.',
        'می‌خواهید برای خودتان یا تیمتان درباره یک جدول یادداشت بگذارید.',
      ],
      howItWorks: [
        'در بالا یک اتصال و سپس یک دیتابیس انتخاب کنید. OpsDeck در صورت نیاز اتصال را باز می‌کند و metadata را می‌خواند. آنچه می‌بینید به engine بستگی دارد: دیتابیس‌های رابطه‌ای schemaها را با جدول‌ها و موارد دیگر نشان می‌دهند؛ MongoDB، collectionها را؛ Elasticsearch/OpenSearch، indicesها را؛ و Redis، کلیدها را.',
        'روی یک شیء در درخت سمت چپ کلیک کنید تا در سمت راست باز شود. پیش‌نمایش‌ها محدود هستند: فقط چند ردیف اول را می‌بینید، هرگز کل جدول را.',
        'اتصال، دیتابیس و گره‌های باز شده درخت که انتخاب کرده‌اید، با راه‌اندازی مجدد برنامه هم به خاطر سپرده می‌شوند.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Connection selector', description: 'انتخاب می‌کنید کدام اتصال ذخیره‌شده را مرور کنید. اگر هیچ اتصالی نداشته باشید، یک صفحه خالی با دکمه New connection می‌بینید.' },
            { name: 'Refresh', description: 'metadata را دوباره از دیتابیس می‌خواند (بعد از ساخت یا حذف جدول‌ها در جای دیگر از آن استفاده کنید).' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Toolbar (نوار ابزار)',
          items: [
            { name: 'Database', description: 'فهرست کشویی دیتابیس‌هایی که برای کاربر شما قابل مشاهده‌اند. برای سرورهایی که نمی‌توان فهرستشان کرد، یک فیلد متنی است که نام را در آن تایپ می‌کنید.' },
            { name: 'Filter tables, views, keys', description: 'تایپ کنید تا درخت سمت چپ بلافاصله محدود شود.' },
            { name: 'SCAN pattern (Redis only)', description: 'یک الگوی glob در Redis مانند user:* برای انتخاب اینکه کدام کلیدها فهرست شوند. مقدار پیش‌فرض * همه را شامل می‌شود.' },
            { name: 'Loading indicator', description: 'هنگام دریافت داده‌ها عبارت "Reading metadata..." نمایش داده می‌شود.' },
          ],
        },
        {
          name: 'Object tree (left)',
          description: 'بسته به engine فرق می‌کند. یک badge کوچک شمارنده کنار هر گره قرار دارد.',
          items: [
            { name: 'Relational (PostgreSQL, MySQL, MariaDB, SQLite)', description: 'هر schema شامل Tables (با تعداد تخمینی ردیف)، Views، Indexes، Functions & procedures، Triggers و Sequences است، در صورتی که وجود داشته باشند. در سطح دیتابیس ممکن است Users & roles (superuserها مشخص شده‌اند) و Extensions را هم ببینید. فقط جدول‌ها و viewها را می‌توان در سمت راست باز کرد.' },
            { name: 'MongoDB', description: 'فهرست collectionها با تعداد document. اگر سرور چند دیتابیس داشته باشد، chipهای زیر فهرست اجازه می‌دهند دیتابیس را عوض کنید و اندازه‌اش را ببینید.' },
            { name: 'Elasticsearch / OpenSearch', description: 'فهرست indicesها با تعداد document.' },
            { name: 'Redis', description: 'فهرست کلیدهایی که با الگو مطابقت دارند. badge ای مانند 3600s زمان باقی‌مانده TTL را نشان می‌دهد. با نگه داشتن ماوس روی یک کلید، نوع و حافظه‌اش دیده می‌شود. "Load more" دسته بعدی را می‌گیرد (SCAN cursor)؛ وقتی چیزی نمانده باشد، "End of SCAN" نشان داده می‌شود.' },
          ],
        },
        {
          name: 'Object detail (right)',
          description: 'تا وقتی روی یک شیء کلیک نکنید خالی است ("Inspect an object").',
          items: [
            { name: 'Query', description: 'SQL editor را با یک دستور آماده برای آن شیء باز می‌کند.' },
            { name: 'Copy name', description: 'نام شیء را در clipboard کپی می‌کند.' },
            { name: 'Row badges', description: '"N rows shown"، "N total" وقتی مشخص باشد، و یک badge زرد "bounded" وقتی پیش‌نمایش کوتاه شده باشد.' },
            { name: 'Data preview', description: 'جدولی از ردیف‌های اول (حداکثر 200 ردیف نمایش داده می‌شود). مقادیر NULL به صورت NULL نشان داده می‌شوند؛ objectها به صورت JSON فشرده. documentها و سایر داده‌های غیرجدولی به صورت JSON قالب‌بندی‌شده نمایش داده می‌شوند.' },
            { name: 'Investigation notes', description: 'یک کادر یادداشت برای این شیء. Add note یک دیالوگ باز می‌کند؛ هر یادداشت نویسنده و مدت زمان گذشته‌اش را نشان می‌دهد و دکمه حذف دارد. یادداشت‌ها به صورت محلی ذخیره می‌شوند و در export کتابخانه query هم قرار می‌گیرند.' },
          ],
        },
        {
          name: 'Redis key detail',
          description: 'وقتی یک کلید را انتخاب کنید نمایش داده می‌شود.',
          items: [
            { name: 'Key facts', description: 'نوع (string, hash, list, set, zset, stream)، TTL ("no expiry"، ثانیه‌های باقی‌مانده، یا "missing")، حافظه مصرفی، encoding داخلی و طول.' },
            { name: 'Value view', description: 'stringها به صورت متن نمایش داده می‌شوند؛ hashها به صورت جدول Field/Value؛ sorted setها به صورت جدول Member/Score؛ و انواع دیگر به صورت JSON.' },
            { name: 'Edit TTL', description: 'تعداد ثانیه را می‌پرسد. مقدار 0 کلید را دائمی می‌کند؛ عدد منفی آن را حذف می‌کند.' },
            { name: 'Delete', description: 'دکمه قرمز. تأیید می‌گیرد و سپس کلید را برای همیشه حذف می‌کند.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Preview table',
          description: 'ستون‌ها همان ستون‌های جدولی هستند که باز کرده‌اید.',
          columns: [
            { name: 'Column headers', meaning: 'همان ستون‌های دیتابیس برای جدول یا view بازشده.', example: 'id, email, created_at' },
            { name: 'Cells', meaning: 'مقادیر همان‌طور که ذخیره شده‌اند. متن‌های بلند کوتاه می‌شوند (برای دیدن بیشتر ماوس را روی آن نگه دارید). NULL یعنی "بدون مقدار".', example: '42 | ada@example.com | 2026-03-02T10:14:00Z' },
          ],
        },
      ],
      example: {
        title: 'مثال: نگاهی به جدول orders',
        steps: [
          'در selector اتصال، "Local Postgres" و در فهرست Database، "shop" را انتخاب کنید.',
          'schema با نام "public" و سپس Tables را باز کنید.',
          'در کادر فیلتر "ord" را تایپ کنید. درخت عبارت "orders  12,480" (حدود 12,480 ردیف) را نشان می‌دهد.',
          'روی "orders" کلیک کنید. سمت راست ردیف‌های اول را با badgeهای "200 rows shown" و "12,480 total" نشان می‌دهد.',
          'روی Query کلیک کنید تا به SQL editor بروید و query را دقیق‌تر کنید.',
        ],
      },
      tips: [
        'تعداد ردیف‌ها در درخت تخمینی هستند و از آمار دیتابیس می‌آیند، نه شمارش دقیق.',
        'کلیدهای Redis با SCAN و در دسته‌های کوچک خوانده می‌شوند تا یک دیتابیس بزرگ قفل نشود. به جای * یک الگوی مشخص‌تر ترجیح بدهید.',
        'Delete و Edit TTL داده‌های واقعی روی سرور Redis را تغییر می‌دهند، پس قبل از تأیید نام کلید را دوباره بررسی کنید.',
        'indexها، functionها، triggerها، sequenceها، کاربران و extensionها فقط برای اطلاع نمایش داده می‌شوند و قابل باز شدن نیستند.',
      ],
    },

    'databases/editor': {
      title: 'SQL editor (ویرایشگر SQL)',
      summary: 'روی یک اتصال query (یا دستور مخصوص engine) بنویسید و اجرا کنید، نتایج را بخوانید، execution plan را بررسی کنید، داده‌ها را export کنید و کتابخانه‌ای از queryهای ذخیره‌شده نگه دارید.',
      whenToUse: [
        'جوابی از داده‌ها لازم دارید که پیش‌نمایش Explorer نمی‌تواند بدهد.',
        'می‌خواهید بررسی کنید یک query چگونه اجرا خواهد شد (Explain).',
        'می‌خواهید نتیجه را به صورت CSV، JSON یا SQL export کنید.',
        'می‌خواهید با کمک AI از روی توضیح ساده، یک query پیش‌نویس شود.',
      ],
      howItWorks: [
        'در header اتصال و دیتابیس را انتخاب کنید، دستور را در کادر متن بنویسید و Run را بزنید (یا Ctrl+Enter). اگر متنی انتخاب شده باشد، Run selection (یا Ctrl+Enter) فقط همان بخش را اجرا می‌کند. ویرایشگر برای نام جدول‌ها و ستون‌ها autocomplete دارد.',
        'نتایج قبل از رسیدن به صفحه محدود می‌شوند (پیش‌فرض 1000 ردیف) و صفحه به شما می‌گوید که کوتاه شده‌اند. هر دستور همچنین در Query history و Activity log ثبت می‌شود.',
        'ایمنی: اتصالی که read-only علامت خورده باشد دستورهای نوشتن را رد می‌کند. حتی روی یک اتصال عادی، دستورهای پرخطر (DROP، TRUNCATE، DELETE یا UPDATE بدون WHERE، ALTER TABLE ... DROP، FLUSHALL/FLUSHDB/SHUTDOWN) یک تأییدیه "Destructive statement" با دکمه "Run anyway" نشان می‌دهند. تا تأیید نکنید چیزی اجرا نمی‌شود.',
        'فقط SQL نیست: برای Redis دستورها را تایپ می‌کنید (SCAN 0 MATCH user:* COUNT 100)؛ برای MongoDB یک دستور JSON ({"find":"users","filter":{},"limit":10})؛ و برای Elasticsearch/OpenSearch یک search body به شکل JSON ({"query":{"match_all":{}},"size":10}). یک بنر آبی این راهنمایی‌ها را تکرار می‌کند. الگوهای گسترده KEYS و دستورهای خطرناک Redis (FLUSHALL، CONFIG، SHUTDOWN و مشابه آن‌ها) مسدود هستند.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Connection and database selectors', description: 'محل اجرای query را انتخاب می‌کنند. زیرعنوان، engine و عبارت "read-only profile" را وقتی نوشتن مسدود است نشان می‌دهد.' },
            { name: 'Refresh', description: 'فهرست دیتابیس‌ها را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'AI query assistant (دستیار query با AI)',
          description: 'فقط برای engineهای SQL نمایش داده می‌شود (نه Redis، MongoDB یا Elasticsearch).',
          items: [
            { name: 'Describe the data you need', description: 'با کلمات ساده بنویسید، مثلاً "orders created today with their customer name, newest first" (حداکثر 2000 کاراکتر).' },
            { name: 'Generate query (Ctrl+Enter)', description: 'فقط نام جدول‌ها و ستون‌ها به‌علاوه جمله شما را به ارائه‌دهنده AI تنظیم‌شده می‌فرستد. هرگز اعتبارنامه‌ها یا داده‌های ردیف‌ها را نمی‌فرستد. چیزی اجرا نمی‌شود.' },
            { name: 'Answer panel', description: 'یک توضیح، دستور SQL و گاهی یک نسخه Django ORM نشان می‌دهد. اگر چند نسخه باشد، با تب‌ها بین آن‌ها جابه‌جا می‌شوید. "Use in editor" دستور SQL را در ویرایشگر کپی می‌کند؛ Copy آن را در clipboard کپی می‌کند. همیشه قبل از اجرا بازبینی کنید.' },
            { name: 'Not configured', description: 'اگر هیچ ارائه‌دهنده AI تنظیم نشده باشد، یک بنر قرمز همین را با دکمه Open settings نشان می‌دهد.' },
          ],
        },
        {
          name: 'Editor bar (نوار ویرایشگر)',
          description: 'یک badge برای dialect (مثلاً postgres، mysql) و یک خط راهنما، و سپس دکمه‌های عملیات.',
          items: [
            { name: 'Run', description: 'کل متن را اجرا می‌کند. هنگام اجرا "Running..." نشان می‌دهد.' },
            { name: 'Run selection', description: 'فقط متن هایلایت‌شده را اجرا می‌کند.' },
            { name: 'Explain', description: 'به جای اجرای دستور، execution plan را نشان می‌دهد. plan در یک کارت "Execution plan" با دکمه Copy ظاهر می‌شود.' },
            { name: 'Save query', description: 'یک دیالوگ باز می‌کند تا دستور را در کتابخانه‌تان ذخیره کنید: نام، توضیح، tagها (جدا شده با کاما، حداکثر 8) و نویسنده، همراه با پیش‌نمایش SQL.' },
            { name: 'Library (N)', description: 'کارت Query library را نشان می‌دهد یا پنهان می‌کند. N تعداد queryهای ذخیره‌شده است.' },
            { name: 'Cancel', description: 'از سرور می‌خواهد query در حال اجرا را متوقف کند. toast می‌گوید "Cancellation requested" یا "Nothing to cancel".' },
          ],
        },
        {
          name: 'Query library card (کارت کتابخانه query)',
          description: 'queryهای ذخیره‌شده که روی همین کامپیوتر نگهداری می‌شوند.',
          items: [
            { name: 'Search box and tag filter', description: 'بر اساس نام، متن SQL، tag یا نویسنده فیلتر کنید و فقط یک tag را نمایش دهید.' },
            { name: 'Load', description: 'query ذخیره‌شده (همراه با اتصال و دیتابیسش) را به ویرایشگر برمی‌گرداند.' },
            { name: 'Delete (trash)', description: 'query ذخیره‌شده را حذف می‌کند.' },
            { name: 'Export / Import', description: 'کل کتابخانه را در یک فایل ذخیره می‌کند، یا فایلی از همکارتان را بارگذاری می‌کند. Investigation notes مربوط به Explorer همراه export منتقل می‌شوند.' },
            { name: 'Close', description: 'کارت را پنهان می‌کند.' },
          ],
        },
        {
          name: 'Query results card (کارت نتایج query)',
          description: 'بعد از یک اجرای موفق ظاهر می‌شود.',
          items: [
            { name: 'Table / JSON / Raw tabs', description: 'Table یک جدول است (روی سرستون کلیک کنید تا مرتب شود، دوباره کلیک کنید تا معکوس شود). JSON ردیف‌ها را قالب‌بندی‌شده نشان می‌دهد. Raw در هر خط یک شیء JSON نشان می‌دهد. JSON و Raw تا 500 ردیف نمایش می‌دهند.' },
            { name: 'Search results', description: 'ردیف‌هایی را که قبلاً برگشته‌اند فیلتر می‌کند (query جدیدی اجرا نمی‌کند).' },
            { name: 'CSV / JSON / SQL buttons', description: 'نتیجه فعلی را در یک فایل export می‌کنند. SQL دستورهای INSERT برای جدول "exported_rows" می‌سازد.' },
            { name: 'Pager', description: 'وقتی بیش از 100 ردیف وجود داشته باشد ظاهر می‌شود: Previous، "Page 2 of 5"، Next.' },
            { name: 'Empty result', description: 'برای دستورهایی که ردیفی برنمی‌گردانند (INSERT، UPDATE)، پیام "Statement completed" نشان می‌دهد چند ردیف تحت تأثیر قرار گرفته است.' },
          ],
        },
        {
          name: 'Error banner (بنر خطا)',
          description: 'یک بنر قرمز "Query failed" با خطای دیتابیس و دکمه Copy error.',
        },
      ],
      tables: [
        {
          name: 'Result badges',
          description: 'badgeهای کوچک بالای نتایج.',
          columns: [
            { name: 'N rows', meaning: 'تعداد ردیف‌هایی که در نتیجه نمایش داده شده‌اند.', example: '25 rows' },
            { name: 'N returned', meaning: 'زرد. سرور ردیف‌های بیشتری از آنچه اینجا نمایش داده شده برگردانده است.', example: '4,200 returned' },
            { name: 'Duration', meaning: 'دیتابیس چقدر زمان برد.', example: '38 ms' },
            { name: 'N affected', meaning: 'ردیف‌هایی که با INSERT/UPDATE/DELETE تغییر کرده‌اند.', example: '3 affected' },
            { name: 'truncated by row limit', meaning: 'زرد. نتیجه به سقف تعداد ردیف رسید؛ LIMIT/WHERE اضافه کنید یا query محدودتری بنویسید.', example: 'truncated by row limit' },
            { name: 'Command tag', meaning: 'نوع دستوری که سرور گزارش می‌کند.', example: 'SELECT' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن orderهای اخیر و ذخیره query',
        steps: [
          '"Local Postgres" و دیتابیس "shop" را انتخاب کنید.',
          'این را تایپ کنید: SELECT id, total, created_at FROM orders ORDER BY created_at DESC LIMIT 20;',
          'Ctrl+Enter را بزنید. نتایج "20 rows" و "12 ms" را نشان می‌دهند.',
          'روی سرستون "total" کلیک کنید تا بر اساس مبلغ مرتب شود، سپس روی CSV کلیک کنید تا ردیف‌ها export شوند.',
          'روی Save query کلیک کنید، نامش را "Latest orders" بگذارید، tag آن را "orders" کنید و ذخیره کنید. بعداً آن را در Library پیدا می‌کنید.',
        ],
      },
      tips: [
        'قبل از اجرای یک query سنگین روی دیتابیس production شلوغ، ابتدا Explain را بزنید.',
        'DELETE یا UPDATE بدون WHERE تأیید می‌خواهد. قبل از زدن "Run anyway" پیام را بخوانید.',
        'روی پروفایل read-only فقط دستورهای خواندنی (SELECT، WITH، VALUES و مشابه) اجرا می‌شوند. بقیه پیام "This connection is read-only" را برمی‌گردانند.',
        'مرتب‌سازی و جستجوی نتایج فقط روی ردیف‌های بارگذاری‌شده کار می‌کند، نه روی کل جدول.',
      ],
    },

    'databases/history': {
      title: 'Query history (تاریخچه queryها)',
      summary: 'فهرستی از دستوراتی که از طریق SQL editor روی همین کامپیوتر اجرا کرده‌اید، همراه با نتیجه، تعداد ردیف و مدت اجرا.',
      whenToUse: [
        'می‌خواهید queryای را که قبلاً نوشته‌اید دوباره اجرا یا بازیابی کنید.',
        'می‌خواهید ببینید کدام queryها شکست خورده‌اند و چرا.',
        'می‌خواهید بررسی کنید queryهای گذشته چقدر طول کشیده‌اند.',
      ],
      howItWorks: [
        'هر دستوری که از SQL editor اجرا شود، موفق یا ناموفق، خودکار ثبت می‌شود. مقادیری که شبیه اعتبارنامه باشند پنهان (redact) می‌شوند. صفحه 300 ورودی آخر را نشان می‌دهد، جدیدترین اول.',
        'تاریخچه فقط روی همین کامپیوتر است. با Activity log فرق دارد، که اتصال‌ها، تغییرات schema و عملیات سرویس‌ها را هم ثبت می‌کند.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Clear history', description: 'تأیید می‌گیرد و سپس تاریخچه ثبت‌شده روی این میزبان را حذف می‌کند. Activity logها حفظ می‌شوند.' },
            { name: 'Refresh', description: 'فهرست را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'History table (جدول تاریخچه)',
          description: 'یک ردیف برای هر دستور. تا وقتی چیزی در ویرایشگر اجرا نکنید خالی است ("No queries recorded yet").',
          items: [
            { name: 'Open in editor (row button)', description: 'دستور را در SQL editor بارگذاری می‌کند تا آن را اجرا یا ویرایش کنید.' },
            { name: 'Copy SQL (row button)', description: 'دستور را در clipboard کپی می‌کند.' },
          ],
        },
      ],
      tables: [
        {
          name: 'History table',
          columns: [
            { name: 'When', meaning: 'زمان نسبی. برای تاریخ دقیق ماوس را روی آن نگه دارید.', example: '5 minutes ago' },
            { name: 'Connection', meaning: 'نام اتصال، با engine در زیر آن.', example: 'Local Postgres / postgres' },
            { name: 'Status', meaning: 'success (سبز) یا failed (قرمز).', example: 'failed' },
            { name: 'Rows', meaning: 'ردیف‌های برگشتی یا تحت‌تأثیر.', example: '20' },
            { name: 'Duration', meaning: 'زمان اجرا.', example: '38 ms' },
            { name: 'Statement', meaning: 'دستور SQL، کوتاه‌شده (برای دیدن بیشتر ماوس را روی آن نگه دارید). برای شکست‌ها، خطای دیتابیس به رنگ قرمز زیر آن می‌آید.', example: 'SELECT * FROM orderz  /  relation "orderz" does not exist' },
          ],
        },
      ],
      example: {
        title: 'مثال: رفع یک query ناموفق',
        steps: [
          'Query history را باز کنید و ردیفی را که badge قرمز "failed" دارد پیدا کنید.',
          'خطای زیر دستور را بخوانید: relation "orderz" does not exist.',
          'روی Open in editor کلیک کنید، نام جدول را به "orders" اصلاح کنید و Run را بزنید.',
        ],
      },
      tips: [
        'Clear history فقط همین فهرست را پاک می‌کند، نه Activity log را.',
        'برای آمارهایی مثل کندترین queryها یا پرتکرارترین‌ها، صفحه Intelligence را ببینید.',
      ],
    },

    'databases/local': {
      title: 'Local databases (دیتابیس‌های محلی)',
      summary: 'سرویس‌های دیتابیسی که مستقیماً روی همین کامپیوتر نصب شده‌اند (نه در Docker)، با تشخیص از روی portهای در حال گوش دادن، processها و برنامه‌های نصب‌شده، همراه با کنترل‌های start، stop و restart.',
      whenToUse: [
        'PostgreSQL، MySQL، Redis یا مشابه آن را روی همین دستگاه نصب کرده‌اید و می‌خواهید به آن وصل شوید.',
        'یک دیتابیس محلی پاسخ نمی‌دهد و می‌خواهید ببینید در حال اجراست یا نه.',
        'می‌خواهید یک سرویس دیتابیس محلی را start، stop یا restart کنید.',
      ],
      howItWorks: [
        'OpsDeck بررسی می‌کند کدام portهای دیتابیس روی 127.0.0.1 در حال گوش دادن هستند، چه processهایی اجرا می‌شوند و چه برنامه‌های دیتابیسی نصب شده‌اند. اسکن هنگام باز کردن صفحه اجرا می‌شود و چند ثانیه از نتیجه‌اش دوباره استفاده می‌شود؛ برای اسکن اجباری از Rescan استفاده کنید.',
        'Start، stop و restart از systemd (systemctl) روی همین دستگاه استفاده می‌کنند. اگر برای engine هیچ service unit ای وجود نداشته باشد، OpsDeck به جای تظاهر به موفقیت، شکست واقعی را نشان می‌دهد.',
        'دیتابیس‌های Docker در صفحه Docker databases فهرست می‌شوند، نه اینجا.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Rescan', description: 'Discovery را دوباره اجرا می‌کند.' },
            { name: 'Refresh', description: 'صفحه را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Row actions (عملیات هر ردیف)',
          items: [
            { name: 'Open', description: 'وقتی نمایش داده می‌شود که برای این دیتابیس از قبل پروفایل اتصال وجود دارد. آن را در Explorer باز می‌کند.' },
            { name: 'Connect', description: 'وقتی نمایش داده می‌شود که سرویس در حال گوش دادن است و پروفایلی وجود ندارد. فرم New connection را با host و port از پیش پرشده باز می‌کند؛ شما user و password را اضافه می‌کنید و ذخیره می‌کنید.' },
            { name: 'Start the service to connect', description: 'وقتی سرویس متوقف است جای Connect می‌آید.' },
            { name: 'Start service (play)', description: 'برای سرویس‌های متوقف نمایش داده می‌شود.' },
            { name: 'Restart service / Stop service', description: 'برای سرویس‌های در حال گوش دادن نمایش داده می‌شوند. هرکدام ابتدا تأیید می‌گیرند.' },
          ],
        },
        {
          name: 'Service management banner (بنر مدیریت سرویس)',
          description: 'یادآوری اینکه start، stop و restart از طریق systemctl انجام می‌شوند و شکست‌ها را صادقانه گزارش می‌کنند.',
        },
        {
          name: 'Empty and error states (حالت خالی و خطا)',
          description: 'وقتی چیزی تشخیص داده نشود، "No local database services found" نشان داده می‌شود. اگر دستگاه قابل بررسی نباشد، یک بنر قرمز ظاهر می‌شود.',
        },
      ],
      tables: [
        {
          name: 'Local services table',
          columns: [
            { name: 'Engine', meaning: 'نوع دیتابیس. badge خاکستری "planned" یعنی شناخته می‌شود اما هنوز پشتیبانی نمی‌شود.', example: 'PostgreSQL' },
            { name: 'Endpoint', meaning: 'host و port ای که روی آن گوش می‌دهد.', example: '127.0.0.1:5432' },
            { name: 'Process', meaning: 'نام process در حال اجرا، اگر پیدا شود.', example: 'postgres' },
            { name: 'Binary', meaning: 'مسیر برنامه نصب‌شده، یا badge زرد "not on PATH" اگر پیدا نشده باشد.', example: '/usr/bin/psql' },
            { name: 'State', meaning: 'listening (سبز): روی port اتصال می‌پذیرد. stopped (خاکستری): چیزی گوش نمی‌دهد.', example: 'listening' },
          ],
        },
      ],
      example: {
        title: 'مثال: اتصال به یک Redis محلی',
        steps: [
          'Local databases را باز کنید. یک ردیف Redis، 127.0.0.1:6379 و وضعیت "listening" را نشان می‌دهد.',
          'روی Connect کلیک کنید. فرم New connection با host و port پرشده باز می‌شود.',
          'روی Test connection و سپس Create connection کلیک کنید.',
          'حالا ردیف یک دکمه Open دارد که به Explorer می‌رود.',
        ],
      },
      tips: [
        'سرویس متوقف نمی‌تواند اتصال بپذیرد. ابتدا آن را start کنید و بعد وصل شوید.',
        'Restart و Stop همه clientهایی را که از آن دیتابیس استفاده می‌کنند قطع می‌کنند.',
        'start کردن یک سرویس ممکن است به دسترسی‌های سیستمی نیاز داشته باشد؛ اگر شکست بخورد، پیام خطا مستقیماً از systemctl می‌آید.',
      ],
    },

    'databases/docker': {
      title: 'Docker databases (دیتابیس‌های Docker)',
      summary: 'containerهای دیتابیس پیداشده در Docker، گروه‌بندی‌شده بر اساس پروژه Compose، همراه با portها، storage و وضعیتشان، به‌علاوه کنترل‌هایی برای connect، start، stop، restart و خواندن logها.',
      whenToUse: [
        'دیتابیس‌ها را در Docker یا Docker Compose اجرا می‌کنید و می‌خواهید بدون تایپ کردن portها به آن‌ها وصل شوید.',
        'دیتابیس یک container در دسترس نیست و می‌خواهید بدانید چرا.',
        'می‌خواهید بررسی کنید یک container دیتابیس داده‌هایش را روی volume نگه می‌دارد یا نه.',
      ],
      howItWorks: [
        'OpsDeck containerهای در حال اجرا و متوقف را بررسی می‌کند و دیتابیس‌ها را از روی نام imageها، portها، نام متغیرهای محیطی، labelها و metadata تشخیص می‌دهد. badge با عنوان "detection" نشان می‌دهد چقدر مطمئن است (high، medium، low)؛ ماوس را روی آن نگه دارید تا دلیل‌ها را ببینید.',
        'اجرا بودن یک container ثابت نمی‌کند که دیتابیس اتصال می‌پذیرد. OpsDeck هر کاندید را قبل از ذخیره پروفایل تست می‌کند و هرگز اعتبارنامه‌ها را حدس نمی‌زند.',
        'containerهایی که هیچ host port منتشرشده‌ای ندارند فقط از داخل شبکه Docker قابل دسترسی هستند. OpsDeck آدرس IP داخلی را حدس نمی‌زند؛ در عوض "How to connect" راه‌حل دقیق را نشان می‌دهد.',
        'ردیف‌ها در یک کارت برای هر پروژه Compose ("Compose project - shop") و یک کارت "Standalone containers" گروه‌بندی می‌شوند.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Rescan', description: 'Discovery را دوباره اجرا می‌کند.' },
            { name: 'Refresh', description: 'صفحه را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Banners (بنرها)',
          items: [
            { name: 'Detection, not assumption', description: 'یادداشت آبی که توضیح می‌دهد OpsDeck کاندیدها را تست می‌کند و اعتبارنامه‌ها را حدس نمی‌زند.' },
            { name: 'Some databases are not reachable', description: 'یادداشت زرد که وقتی حداقل یک container هیچ host port قابل استفاده‌ای ندارد نمایش داده می‌شود.' },
          ],
        },
        {
          name: 'Row actions (عملیات هر ردیف)',
          items: [
            { name: 'Open', description: 'وقتی نمایش داده می‌شود که پروفایل از قبل وجود دارد. Explorer را روی آن باز می‌کند.' },
            { name: 'Connect', description: 'برای دیتابیس‌های در دسترس و پشتیبانی‌شده که پروفایل ندارند نمایش داده می‌شود. فرم New connection را از پیش پر می‌کند (نام، engine، host، port منتشرشده، group = پروژه Compose). شما user و password را اضافه می‌کنید.' },
            { name: 'How to connect', description: 'وقتی نمایش داده می‌شود که دسترسی ممکن نیست. یک دیالوگ راهنما باز می‌کند. بسته به حالت: "This container is not running" (با دکمه Start container)، "Publish a host port to connect" (خط ports را که باید به compose.yml اضافه کنید و دستور docker compose یا docker run را نشان می‌دهد، به‌علاوه دکمه Rescan now)، یا "No adapter for this engine yet" وقتی engine تشخیص داده شده اما پشتیبانی نمی‌شود (دکمه "Not supported" نام دارد).' },
            { name: 'Stop / Start container', description: 'container در حال اجرا را متوقف می‌کند یا container متوقف را راه می‌اندازد. stop کردن تأیید می‌گیرد چون همه clientها دیتابیس را از دست می‌دهند.' },
            { name: 'Restart container', description: 'بعد از تأیید، container را restart می‌کند.' },
            { name: 'Container logs', description: 'نمایشگر log را برای container باز می‌کند.' },
            { name: 'Open in Docker workspace', description: 'به صفحه Containers در بخش Docker می‌رود.' },
          ],
        },
        {
          name: 'Empty and error states (حالت خالی و خطا)',
          description: 'وقتی چیزی پیدا نشود "No database containers detected" نشان داده می‌شود. اگر به Docker دسترسی نباشد، بنر قرمز "Docker discovery unavailable" ظاهر می‌شود.',
        },
      ],
      tables: [
        {
          name: 'Docker databases table',
          columns: [
            { name: 'Database', meaning: 'نام container یا سرویس، با نام سرویس Compose یا شناسه کوتاه container در زیر آن.', example: 'shop-db-1 / db' },
            { name: 'Engine', meaning: 'engine تشخیص‌داده‌شده به‌علاوه یک badge با عنوان "detection high/medium/low".', example: 'PostgreSQL, detection high' },
            { name: 'Image', meaning: 'image ای از Docker که container از روی آن ساخته شده است.', example: 'postgres:16' },
            { name: 'Container', meaning: 'badge وضعیت (running، exited و ...) همراه با متن status و شناسه کوتاه container.', example: 'running, Up 2 hours, a1b2c3d4' },
            { name: 'Ports', meaning: 'اگر منتشر شده باشد: آدرس و port میزبان با port container در زیر آن. اگر نه: port container با یک badge زرد "internal only".', example: '127.0.0.1:5433 -> 5432/tcp' },
            { name: 'Storage', meaning: 'سبز "volume" = داده روی یک named volume در Docker؛ سبز "bind mount" = داده در یک پوشه روی میزبان؛ قرمز "ephemeral" = با حذف container داده از بین می‌رود.', example: 'volume' },
          ],
        },
      ],
      example: {
        title: 'مثال: اتصال به یک Postgres در Compose که "internal only" است',
        steps: [
          'Docker databases را باز کنید. پروژه Compose با نام "shop" سرویس "db" را با Ports برابر "5432/tcp - internal only" فهرست می‌کند.',
          'روی How to connect کلیک کنید. دیالوگ خط‌هایی را که باید اضافه کنید نشان می‌دهد: ports: - "5433:5432".',
          'آن‌ها را به compose.yml اضافه کنید و دستور نمایش‌داده‌شده را اجرا کنید: docker compose -p shop up -d db.',
          'روی Rescan now کلیک کنید. حالا ردیف 127.0.0.1:5433 و دکمه Connect را نشان می‌دهد.',
          'روی Connect کلیک کنید، user و password را وارد کنید و سپس Create connection را بزنید.',
        ],
      },
      tips: [
        'badge قرمز "ephemeral" برای storage یعنی حذف container داده‌ها را نابود می‌کند. قبل از ذخیره هر چیز مهمی یک volume اضافه کنید.',
        'stop یا restart کردن یک container همه clientهایش را قطع می‌کند.',
        'host port در راه‌حل پیشنهادی فقط یک پیشنهاد است؛ هر port آزاد دیگری هم کار می‌کند.',
      ],
    },

    'databases/kubernetes': {
      title: 'Kubernetes databases (دیتابیس‌های Kubernetes)',
      summary: 'workloadهای دیتابیس (Podها و StatefulSetها) که در context و namespace انتخاب‌شده Kubernetes پیدا شده‌اند، با اتصال یک‌کلیکی از طریق port-forward ایمن.',
      whenToUse: [
        'دیتابیس‌های شما در یک کلاستر Kubernetes اجرا می‌شوند و می‌خواهید از کامپیوترتان آن‌ها را مرور یا query کنید.',
        'می‌خواهید ببینید کدام podهای دیتابیس وجود دارند و آماده (ready) هستند یا نه.',
      ],
      howItWorks: [
        'این صفحه از context و namespace ای استفاده می‌کند که در حال حاضر در بخش Kubernetes انتخاب شده است (زیر عنوان نمایش داده می‌شود). Podها و StatefulSetهایی که imageشان با یک engine پشتیبانی‌شده مطابقت دارد فهرست می‌شوند.',
        'آدرس IP podها معمولاً از کامپیوتر شما در دسترس نیست، بنابراین OpsDeck هرگز از آن‌ها استفاده نمی‌کند. اتصال یک kubectl port-forward کنترل‌شده را به 127.0.0.1 با context و namespace انتخاب‌شده راه می‌اندازد و وقتی قطع کنید آن را متوقف می‌کند.',
        'اگر هیچ context ای انتخاب نشده باشد، صفحه "No cluster context selected" را با دکمه Open contexts نشان می‌دهد. اگر به Kubernetes دسترسی نباشد، یک بنر قرمز "Kubernetes discovery unavailable" دلیلش را توضیح می‌دهد.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Rescan', description: 'Discovery را دوباره اجرا می‌کند.' },
            { name: 'Refresh', description: 'صفحه را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Port forwarding banner (بنر port-forward)',
          description: 'یادداشت آبی که توضیح می‌دهد اتصال‌ها چگونه برقرار می‌شوند (kubectl port-forward روی 127.0.0.1).',
        },
        {
          name: 'Row actions (عملیات هر ردیف)',
          items: [
            { name: 'Open', description: 'وقتی نمایش داده می‌شود که پروفایل از قبل وجود دارد. Explorer را روی آن باز می‌کند.' },
            { name: 'Connect', description: 'فرم New connection را با pod، namespace و context از پیش پر می‌کند. شما user و password را اضافه می‌کنید و ذخیره می‌کنید. port-forward هنگام اتصال شروع می‌شود.' },
            { name: 'Open workload in Kubernetes', description: 'به صفحه StatefulSets (برای StatefulSetها) یا صفحه Pods (برای podها) در بخش Kubernetes می‌رود.' },
          ],
        },
        {
          name: 'Empty state (حالت خالی)',
          description: '"No database workloads detected": فقط Podها و StatefulSetهایی که imageشان با یک engine پشتیبانی‌شده مطابقت دارد ظاهر می‌شوند.',
        },
      ],
      tables: [
        {
          name: 'Kubernetes databases table',
          columns: [
            { name: 'Workload', meaning: 'نام workload با namespace آن در زیر.', example: 'postgres-0 / production' },
            { name: 'Engine', meaning: 'engine تشخیص‌داده‌شده با یک badge اطمینان "detection".', example: 'PostgreSQL, detection high' },
            { name: 'Kind', meaning: 'StatefulSet یا Pod.', example: 'StatefulSet' },
            { name: 'Status', meaning: 'badge وضعیت pod (مثلاً Running) با تعداد ready در زیر آن.', example: 'Running, 1/1' },
            { name: 'Access', meaning: 'OpsDeck چگونه به آن می‌رسد. همیشه "kubectl port-forward".', example: 'kubectl port-forward' },
          ],
        },
      ],
      example: {
        title: 'مثال: query زدن روی یک دیتابیس داخل کلاستر',
        steps: [
          'در بخش Kubernetes، context و namespace با نام "production" را انتخاب کنید.',
          'Kubernetes databases را باز کنید: "postgres-0, StatefulSet, Running 1/1" فهرست شده است.',
          'روی Connect کلیک کنید، username و password را وارد کنید و ذخیره کنید.',
          'Explorer یا SQL editor را باز کنید: OpsDeck خودکار port-forward را راه می‌اندازد و با قطع اتصال آن را متوقف می‌کند.',
        ],
      },
      tips: [
        'به دسترسی kubectl به کلاستر و مجوز port-forward به pod نیاز دارید.',
        'بعد از تغییر context یا namespace در بخش Kubernetes، Rescan بزنید.',
        'قبل از اجرای queryها، پروفایل‌های production را در فرم اتصال read-only کنید.',
      ],
    },

    'databases/performance': {
      title: 'Performance (کارایی)',
      summary: 'معیارهای سلامت زنده برای یک دیتابیس متصل: اتصال‌ها، کارایی cache، اندازه، uptime، queryهای در حال اجرا و کند، و جزئیات مخصوص هر engine.',
      whenToUse: [
        'برنامه کند شده و می‌خواهید ببینید دیتابیس چه کار می‌کند.',
        'می‌خواهید queryهای طولانی یا کند را پیدا کنید.',
        'می‌خواهید بررسی کنید چقدر به سقف تعداد اتصال یا سقف حافظه نزدیک هستید.',
      ],
      howItWorks: [
        'یک اتصال انتخاب کنید. OpsDeck معیارها را هنگام باز شدن صفحه و هنگام refresh مستقیماً از سرور دیتابیس می‌خواند. مقادیر همان‌طور که گزارش شده‌اند نمایش داده می‌شوند؛ چیزی تخمین زده یا هموار نمی‌شود.',
        'فقط معیارهایی نمایش داده می‌شوند که engine و کاربر شما بتوانند در دسترس قرار دهند، بنابراین کارت‌ها بین PostgreSQL، MySQL/MariaDB، MongoDB، Redis و Elasticsearch فرق دارند. اگر کاربر شما مجوز نداشته باشد، یک بنر زرد "Metrics unavailable" دلیلش را توضیح می‌دهد.',
        'یک selector برای فاصله refresh می‌تواند داده‌ها را خودکار بارگذاری کند. بعد از دو بار خواندن یا بیشتر، یک پاورقی نشان می‌دهد در این session چند نمونه جمع‌آوری شده است.',
      ],
      parts: [
        {
          name: 'Header controls (کنترل‌های بالای صفحه)',
          items: [
            { name: 'Connection selector', description: 'کدام دیتابیس اندازه‌گیری شود.' },
            { name: 'Refresh interval', description: 'Manual refresh (پیش‌فرض)، یا هر 5، 15، 30 یا 60 ثانیه. refresh خودکار فقط تا وقتی این صفحه باز است اجرا می‌شود.' },
            { name: 'Refresh', description: 'معیارها را همین حالا می‌خواند. هنگام کار "Reading..." نشان می‌دهد.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Metric cards (کارت‌های معیار)',
          description: 'فقط کارت‌هایی که engine گزارش می‌کند نمایش داده می‌شوند.',
          items: [
            { name: 'Active connections', description: 'session‌های باز فعلی، با "of N max" وقتی سقف مشخص باشد. مثال: 18 of 100 max.' },
            { name: 'Cache hit ratio', description: 'درصد خواندن‌هایی که از حافظه پاسخ داده شده‌اند. هرچه بالاتر بهتر است؛ مقدار پایین اغلب یعنی دیتابیس به حافظه بیشتر یا indexهای بهتر نیاز دارد. مثال: 99.2%.' },
            { name: 'Database size', description: 'اندازه روی دیسک، در جاهایی که گزارش شود. مثال: 2.4 GB.' },
            { name: 'Uptime', description: 'مدتی که process سرور در حال اجراست.' },
            { name: 'Memory used', description: 'حافظه در حال استفاده (Redis)، با مقدار حداکثر اگر تنظیم شده باشد.' },
            { name: 'Commands / sec', description: 'تعداد عملیات فعلی در ثانیه (Redis).' },
            { name: 'Cluster health', description: 'وضعیت Elasticsearch/OpenSearch: GREEN، YELLOW یا RED، با تعداد node و shard.' },
            { name: 'Tables', description: 'تعداد جدول‌ها و indexها (SQLite و مشابه).' },
          ],
        },
        {
          name: 'Detail sections (بخش‌های جزئیات)',
          description: 'وقتی داده وجود داشته باشد نمایش داده می‌شوند.',
          items: [
            { name: 'Connection states', description: 'session‌ها گروه‌بندی‌شده بر اساس وضعیت، مثلاً active، idle، idle in transaction.' },
            { name: 'Long-running queries', description: 'queryهایی که بیش از حدود یک ثانیه اجرا شده‌اند: PID، user، state، مدت و متن query.' },
            { name: 'Slow query analysis', description: 'پرهزینه‌ترین دستورها با calls، mean time و rows. در PostgreSQL به pg_stat_statements و در MySQL به performance schema نیاز دارد؛ در غیر این صورت یک بنر زرد "Extension not available" همین را می‌گوید.' },
            { name: 'Transactions', description: 'commit شده، rollback شده، deadlockها و بایت‌های موقت نوشته‌شده.' },
            { name: 'Operations', description: 'شمارنده‌های عملیات MongoDB (insert، query، update، delete و ...).' },
            { name: 'Replication', description: 'برای MongoDB، یک جدول members (name، state، lag). برای Redis، role، replicaهای متصل و وضعیت master link.' },
            { name: 'Clients', description: 'clientهای متصل Redis (address، name، database، last command).' },
            { name: 'Redis slow log', description: 'کندترین دستورهای اخیر Redis با زمان و مدت اجرا.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Long-running queries',
          columns: [
            { name: 'PID', meaning: 'شناسه process یا session مربوط به query.', example: '4812' },
            { name: 'User', meaning: 'کاربر دیتابیسی که آن را اجرا می‌کند.', example: 'app_user' },
            { name: 'State', meaning: 'session در حال انجام چه کاری است.', example: 'active' },
            { name: 'Duration', meaning: 'چه مدت است که در حال اجراست.', example: '42s' },
            { name: 'Query', meaning: 'متن SQL، کوتاه‌شده.', example: 'SELECT ... FROM orders JOIN items ...' },
          ],
        },
        {
          name: 'Slow query analysis',
          columns: [
            { name: 'Query', meaning: 'متن دستور نرمال‌سازی‌شده.', example: 'SELECT * FROM orders WHERE customer_id = $1' },
            { name: 'Calls', meaning: 'چند بار اجرا شده است.', example: '15,230' },
            { name: 'Mean time', meaning: 'میانگین زمان هر فراخوانی.', example: '84.50 ms' },
            { name: 'Rows', meaning: 'ردیف‌های برگشتی یا بررسی‌شده.', example: '120' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن چیزی که PostgreSQL را کند کرده',
        steps: [
          '"Local Postgres" را انتخاب کنید و فاصله را روی "Every 15s" بگذارید.',
          'Active connections را بررسی کنید: 96 of 100 max یعنی نزدیک سقف هستید.',
          'Long-running queries را باز کنید: یک query از کاربر "report_user" 3 دقیقه است که اجرا می‌شود.',
          'متن query را کپی کنید و آن را در SQL editor با Explain باز کنید تا ببینید چرا کند است.',
        ],
      },
      tips: [
        'بررسی‌های عمیق‌تر، findings و روندها در صفحه Intelligence هستند.',
        'cache hit ratio خیلی پایین درست بعد از restart عادی است؛ cache به زمان برای گرم شدن نیاز دارد.',
        'refresh خودکار بار اضافه‌ای روی سرور می‌گذارد. روی دیتابیس‌های production حساس از Manual refresh استفاده کنید.',
      ],
    },

    'databases/insights': {
      title: 'Intelligence (تحلیل هوشمند)',
      summary: 'تحلیل فقط‌خواندنی (read-only) یک اتصال: امتیاز سلامت، findings، بازبینی schema، روابط بین جدول‌ها، تغییرات schema در طول زمان، sessionهای در حال اجرا، آمار queryها و پیش‌بینی.',
      whenToUse: [
        'می‌خواهید در یک صفحه یک بررسی کلی از سلامت دیتابیس داشته باشید.',
        'می‌خواهید مشکلات طراحی مثل جدول‌های بدون primary key را پیدا کنید.',
        'می‌خواهید بدانید schema از آخرین باری که نگاه کردید تغییر کرده یا نه.',
        'می‌خواهید sessionهای مسدودشده یا queryهایی را که کندتر شده‌اند پیدا کنید.',
      ],
      howItWorks: [
        'در کارت Connection یک اتصال انتخاب کنید. صفحه metadata و معیارها را می‌خواند، نتایج را محاسبه می‌کند و تا وقتی باز است هر 90 ثانیه خودش را refresh می‌کند. Refresh یک خواندن تازه را اجبار می‌کند.',
        'تحلیل فقط می‌خواند: هیچ query نوشتنی اجرا نمی‌شود. هر چیزی که قابل اندازه‌گیری نبوده باشد به صورت "unknown" نشان داده می‌شود یا زیر Limitations فهرست می‌شود، و هرگز سالم حساب نمی‌شود.',
        'اولین باری که یک schema خوانده می‌شود به عنوان baseline ذخیره می‌شود؛ خواندن‌های بعدی با آن مقایسه می‌شوند.',
        'بعضی بخش‌ها به قابلیتی از engine نیاز دارند (مثلاً تحلیل schema و dependency فقط روی engineهای رابطه‌ای کار می‌کند). وقتی بخشی در دسترس نباشد، دلیلش را می‌گوید.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Cross-module view', description: 'نمای کلی workspace مربوط به Intelligence را باز می‌کند که Docker، Databases، Kubernetes و Observability را ترکیب می‌کند.' },
            { name: 'Refresh', description: 'همه چیز را همین حالا می‌خواند و دوباره محاسبه می‌کند.' },
          ],
        },
        {
          name: 'Connection card (کارت اتصال)',
          description: 'یک فهرست کشویی برای انتخاب اتصال ("name - engine - connected") و یک خلاصه: engine، دیتابیس، host، وضعیت، اینکه read-only اعمال می‌شود یا نه، و چند دیتابیس قابل مشاهده است. اگر اتصالی نباشد، یک صفحه خالی "Open connections" را پیشنهاد می‌دهد.',
        },
        {
          name: 'Summary cards (کارت‌های خلاصه)',
          items: [
            { name: 'Tables', description: 'تعداد جدول‌ها، با تعداد index در زیر آن.' },
            { name: 'Rows (estimated)', description: 'مجموع تخمینی ردیف‌ها و مجموع اندازه.' },
            { name: 'Blocked / long', description: 'sessionهایی که توسط session دیگری مسدود شده‌اند، از کل sessionهای فعال. وقتی finding بحرانی وجود داشته باشد قرمز می‌شود.' },
            { name: 'Queries tracked', description: 'دستورهای ثبت‌شده در Query history، با تعداد اجراهای ناموفق.' },
          ],
        },
        {
          name: 'Findings',
          description: 'مشکلات و راهنمایی‌های مبتنی بر قاعده، از سلامت، schema، بار کاری و تاریخچه. هر ردیف یک badge شدت (Critical قرمز، Warning نارنجی، Info آبی، Pass سبز، Unknown خاکستری)، یک عنوان، جزئیات و شواهد دارد، و گاهی یک لینک Open به صفحه مرتبط. chipهای شمارنده در بالا نشان می‌دهند از هر شدت چند مورد وجود دارد.',
        },
        {
          name: 'Health score and Health checks (امتیاز سلامت و بررسی‌های سلامت)',
          description: 'یک امتیاز از 0 تا 100 با یک وضعیت (Healthy، Degraded، Unhealthy، Unknown) و یک نوار. فقط از روی بررسی‌های اندازه‌گیری‌شده وزن‌دهی می‌شود. جدول بررسی‌ها هر بررسی را با نتیجه‌اش (Pass، Warning، Fail، Unknown)، مقدار و جزئیات فهرست می‌کند.',
        },
        {
          name: 'Schema analysis (تحلیل schema)',
          description: 'جدول‌ها با نوع، تعداد تخمینی ردیف، اندازه، تعداد ستون‌ها و indexها، و یک badge در ستون Key: سبز "Primary key" یا نارنجی "No primary key". findingهای schema در زیر فهرست می‌شوند. برای engineهای غیررابطه‌ای در دسترس نیست.',
        },
        {
          name: 'Table dependencies (وابستگی‌های جدول‌ها)',
          description: 'فقط از روی foreign keyهایی ساخته می‌شود که واقعاً تعریف شده‌اند، هرگز از روی حدس زدن نام‌ها. ستون‌های Child table، Columns، Parent table و Constraint را نشان می‌دهد؛ جدول‌های خارج از schema یک badge "external" دارند. همچنین روابط دایره‌ای، پرارجاع‌ترین جدول‌ها و جدول‌های بدون رابطه تعریف‌شده را فهرست می‌کند.',
        },
        {
          name: 'Schema time machine (ماشین زمان schema)',
          description: 'ساختار فعلی را با آخرین capture ذخیره‌شده مقایسه می‌کند. یک بنر می‌گوید "Baseline captured"، "No structural change" یا "N structural change(s) since the previous capture". تغییرات با این برچسب‌ها مشخص می‌شوند: Table added/removed، Column added/removed/changed، Index added/removed/changed، Foreign key added/removed. یک جدول از ساختارهای capture شده تعدادها را نشان می‌دهد و اینکه هرکدام با قبلی فرق داشته یا نه. 8 ساختار متمایز آخر برای هر اتصال نگه داشته می‌شود. "Capture now" schema را دوباره می‌خواند. تغییرات داده‌ها ردیابی نمی‌شوند.',
        },
        {
          name: 'Workloads (بار کاری)',
          description: 'sessionهای فعال با id، user، state، age، wait، یک badge مسدودی (قرمز "N blocking" یا سبز "Not blocked") و دستور. در پایین، "Slow statements from the engine" دستور، calls، mean time و rows را فهرست می‌کند، وقتی engine آن‌ها را بدهد.',
        },
        {
          name: 'Query time machine (ماشین زمان query)',
          description: 'تاریخچه queryهای شما، گروه‌بندی‌شده بر اساس دستور نرمال‌سازی‌شده (بنابراین مقادیر literal متفاوت به عنوان یک query حساب می‌شوند): تعداد اجرا (runs)، نرخ خطا، mean، p95 (یعنی 95% اجراها سریع‌تر از این مقدار بودند) و یک badge روند ("Stable" سبز یا نارنجی "Slower +40%"). "Latest runs" اجراهای اخیر را با OK/Failed، مدت و SQL نشان می‌دهد.',
        },
        {
          name: 'Forecast (پیش‌بینی)',
          description: 'پیش‌بینی می‌کند یک سری اندازه‌گیری‌شده (مثلاً اتصال‌ها یا اندازه) چه زمانی از آستانه‌اش عبور می‌کند، با استفاده از نمونه‌های ذخیره‌شده observability. مقدار فعلی، آستانه، تاریخ پیش‌بینی‌شده عبور، میزان اطمینان و یک یادداشت را نشان می‌دهد. بدون حداقل شش نمونه، "Not enough history to forecast" می‌گوید.',
        },
        {
          name: 'Limitations and read-only banner (محدودیت‌ها و بنر read-only)',
          description: 'کارتی که فهرست می‌کند چه چیزی قابل اندازه‌گیری نبوده و چرا، و یک بنر آبی که تکرار می‌کند تحلیل فقط‌خواندنی است.',
        },
      ],
      tables: [
        {
          name: 'Schema analysis table',
          columns: [
            { name: 'Table', meaning: 'نام جدول همراه با schema آن.', example: 'orders - public' },
            { name: 'Kind', meaning: 'جدول (table) یا view.', example: 'table' },
            { name: 'Rows', meaning: 'تعداد تخمینی ردیف‌ها.', example: '12,480' },
            { name: 'Size', meaning: 'اندازه روی دیسک.', example: '3.1 MB' },
            { name: 'Columns / indexes', meaning: 'تعداد ستون‌ها و indexها.', example: '9 / 3' },
            { name: 'Key', meaning: 'اینکه جدول primary key دارد یا نه.', example: 'No primary key (orange)' },
          ],
        },
        {
          name: 'Query time machine table',
          columns: [
            { name: 'Statement', meaning: 'نمونه‌ای از دستور گروه‌بندی‌شده.', example: 'SELECT * FROM orders WHERE id = 1' },
            { name: 'Runs', meaning: 'چند بار اجرا شده است.', example: '58' },
            { name: 'Errors', meaning: 'سهم اجراهایی که شکست خورده‌اند (اگر هیچ نباشد خالی است).', example: '5.2%' },
            { name: 'Mean / p95', meaning: 'میانگین و صدک 95ام مدت اجرا.', example: '42 ms / 130 ms' },
            { name: 'Trend', meaning: 'اجراهای اخیر را با اجراهای قدیمی‌تر مقایسه می‌کند.', example: 'Slower +65%' },
          ],
        },
      ],
      example: {
        title: 'مثال: بازبینی یک دیتابیس بعد از deploy',
        steps: [
          'Intelligence را باز کنید و در کارت Connection مقدار "Local Postgres" را انتخاب کنید.',
          'کارت Findings را بخوانید: "Warning - Table audit_log has no primary key".',
          'Schema time machine را باز کنید: "2 structural changes since the previous capture" - Column added: orders.coupon_code، Index added: orders_coupon_idx.',
          'Query time machine را بررسی کنید: یک دستور با "Slower +65%" علامت خورده است. آن را در SQL editor کپی کنید و از Explain استفاده کنید.',
        ],
      },
      tips: [
        'این صفحه هرگز داده یا ساختار را تغییر نمی‌دهد.',
        'امتیاز سلامت فقط بررسی‌هایی را حساب می‌کند که قابل اندازه‌گیری بوده‌اند، بنابراین نبود یک مجوز اطمینان را کم می‌کند، نه امتیاز را.',
        'پیش‌بینی‌ها به تاریخچه نیاز دارند. بگذارید observability در OpsDeck نمونه جمع کند تا پیش‌بینی‌های معنادار بگیرید.',
        'تعداد ردیف‌ها تخمینی هستند و از آمار دیتابیس می‌آیند.',
      ],
    },

    'databases/diagnostics': {
      title: 'Diagnostics (عیب‌یابی)',
      summary: 'یک بررسی مرحله‌به‌مرحله از یک اتصال (تنظیمات، شبکه، TLS، login، مجوزها، monitoring) اجرا می‌کند تا دقیقاً ببینید مشکل کجاست.',
      whenToUse: [
        'اتصالی شکست می‌خورد و نمی‌دانید چرا.',
        'رمزعبور، port یا تنظیم TLS را عوض کرده‌اید و می‌خواهید درستی‌اش را تأیید کنید.',
        'می‌خواهید مطمئن شوید کاربر شما می‌تواند دیتابیس‌ها را فهرست کند و معیارهای کارایی را بخواند.',
      ],
      howItWorks: [
        'یک اتصال انتخاب کنید و Run diagnostics را بزنید. بررسی‌ها به ترتیب اجرا می‌شوند و هر مرحله pass، warning یا fail را با یک توضیح کوتاه و مدت زمان اجرا گزارش می‌کند. چیزی در دیتابیس تغییر نمی‌کند.',
        'مرحله‌ها به نوع اتصال بستگی دارند. دیتابیس‌های فایلی (SQLite) وجود فایل را بررسی می‌کنند. اتصال‌های مرتبط با Kubernetes، port-forward را هم بررسی می‌کنند.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Connection selector', description: 'کدام اتصال بررسی شود.' },
            { name: 'Run diagnostics', description: 'بررسی‌ها را شروع می‌کند. در صفحه خالی ("No diagnostics run yet") هم به صورت یک دکمه ارائه می‌شود.' },
          ],
        },
        {
          name: 'Summary banner (بنر خلاصه)',
          description: 'بعد از اجرا: یک "All checks passed" سبز یا یک "Some checks failed" قرمز، همراه با زمان اجرا.',
        },
        {
          name: 'Steps list (فهرست مرحله‌ها)',
          description: 'یک خط برای هر مرحله با آیکون وضعیت (تیک سبز = pass، مثلث زرد = warning، ضربدر قرمز = fail)، نام مرحله، یک جمله توضیح و زمان اجرا.',
          items: [
            { name: 'Configuration', description: 'آیا engine توسط OpsDeck پشتیبانی می‌شود؟' },
            { name: 'Kubernetes port-forward', description: 'فقط برای پروفایل‌های مرتبط با Kubernetes: آیا port-forward توانست شروع شود؟' },
            { name: 'File access', description: 'فقط SQLite: آیا فایل دیتابیس وجود دارد؟' },
            { name: 'Network reachability', description: 'آیا OpsDeck می‌تواند یک اتصال TCP به host و port باز کند؟' },
            { name: 'TLS', description: 'حالت TLS ای را که استفاده خواهد شد نشان می‌دهد.' },
            { name: 'Authentication', description: 'آیا login کار می‌کند؟ در صورت موفقیت، نام کاربر را می‌گوید.' },
            { name: 'Version', description: 'نسخه سرور که دیتابیس گزارش می‌کند.' },
            { name: 'Permissions', description: 'آیا کاربر می‌تواند دیتابیس‌ها را فهرست کند؟ warning یعنی login کار می‌کند اما کاربر محدود است.' },
            { name: 'Monitoring', description: 'آیا معیارهای کارایی قابل خواندن هستند؟ warning یعنی صفحه Performance داده محدودی خواهد داشت.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Example steps',
          columns: [
            { name: 'Network reachability', meaning: 'Pass: port اتصال می‌پذیرد. Fail: host یا port اشتباه، firewall، یا سرور متوقف است.', example: 'pass, 3 ms' },
            { name: 'Authentication', meaning: 'Fail معمولاً یعنی user یا password اشتباه است، یا کاربر اجازه ورود از این میزبان را ندارد.', example: 'fail: password authentication failed' },
            { name: 'Permissions', meaning: 'Warning یعنی login کار می‌کند اما فهرست کردن دیتابیس‌ها مجاز نیست.', example: 'warn: permission denied' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن دلیل شکست یک اتصال',
        steps: [
          'Diagnostics را باز کنید و اتصال ناموفق را انتخاب کنید.',
          'روی Run diagnostics کلیک کنید.',
          'Network reachability موفق است اما Authentication با "password authentication failed" شکست می‌خورد.',
          'به Connections بروید، پروفایل را ویرایش کنید، رمزعبور را دوباره وارد کنید و دوباره diagnostics را اجرا کنید تا "All checks passed" ظاهر شود.',
        ],
      },
      tips: [
        'از دکمه گوشی پزشکی (stethoscope) روی یک ردیف در Connections هم می‌توانید به Diagnostics برسید.',
        'شکست یک مرحله باعث نمی‌شود صفحه مرحله‌های دیگری را که اجرا شده‌اند نشان ندهد.',
        'Warningها خطا نیستند: هنوز می‌توانید وصل شوید، اما ممکن است بعضی قابلیت‌ها محدود باشند.',
      ],
    },

    'databases/activity': {
      title: 'Activity log (گزارش فعالیت)',
      summary: 'تاریخچه‌ای از کارهایی که از طریق OpsDeck روی دیتابیس‌های شما انجام شده است: اتصال‌ها، تست‌ها، queryها، تغییرات schema و عملیات سرویس‌ها.',
      whenToUse: [
        'می‌خواهید بدانید چه کاری، چه زمانی و روی کدام اتصال انجام شده است.',
        'می‌خواهید ببینید چرا چیزی شکست خورده (status و message).',
        'به سابقه عملیات نوشتن یا مخرب که از OpsDeck انجام شده نیاز دارید.',
      ],
      howItWorks: [
        'ورودی‌ها خودکار توسط سرویس دیتابیس نوشته می‌شوند و جدیدترین اول نمایش داده می‌شوند (حداکثر 300). این گزارش فقط روی همین کامپیوتر است.',
        'فقط شامل کارهایی است که از طریق OpsDeck انجام شده‌اند. رویدادهای audit که روی خود سرور دیتابیس ثبت می‌شوند منبع جداگانه‌ای هستند و با این‌ها مخلوط نمی‌شوند.',
        'این صفحه فیلتر یا عملیات ردیفی ندارد. برای دیدن تاریخ و ساعت دقیق، ماوس را روی ستون When نگه دارید.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Refresh', description: 'گزارش را دوباره بارگذاری می‌کند.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Activity table (جدول فعالیت)',
          description: 'یک ردیف برای هر عملیات. حالت خالی: "No activity recorded".',
        },
      ],
      tables: [
        {
          name: 'Activity table',
          columns: [
            { name: 'When', meaning: 'زمان نسبی؛ برای تاریخ دقیق ماوس را روی آن نگه دارید.', example: '10 minutes ago' },
            { name: 'Kind', meaning: 'نوع عملیات. نمونه‌ها: connection, connection-failed, connection-test, disconnect, query, data-browse, connection-deleted, connection-duplicated, connections-imported, local-service, redis-delete, database-created, database-dropped.', example: 'query' },
            { name: 'Connection', meaning: 'مربوط به کدام اتصال بوده است.', example: 'Local Postgres' },
            { name: 'Status', meaning: 'success (سبز)، warning (زرد) یا error (قرمز).', example: 'success' },
            { name: 'Duration', meaning: 'عملیات چقدر طول کشیده، وقتی اندازه‌گیری شده باشد.', example: '38 ms' },
            { name: 'Detail', meaning: 'یک پیام، و برای queryها دستور زیر آن با متن کوچک.', example: 'Query completed - UPDATE orders SET status = \'paid\' WHERE id = 7' },
          ],
        },
      ],
      example: {
        title: 'مثال: چه کسی سرویس دیتابیس را restart کرد؟',
        steps: [
          'Activity log را باز کنید.',
          'دنبال ردیفی با Kind برابر "local-service" بگردید. ستون Detail می‌گوید چه عملیاتی اجرا شده و Status موفقیت یا خطا را نشان می‌دهد.',
          'از ستون When ببینید چه مدت پیش رخ داده است.',
        ],
      },
      tips: [
        'پاک کردن Query history این گزارش را پاک نمی‌کند.',
        'اعتبارنامه‌ها هرگز در این گزارش نوشته نمی‌شوند.',
        'برای دیدن فقط 6 ورودی آخر از Dashboard استفاده کنید.',
      ],
    },
  });
})();
