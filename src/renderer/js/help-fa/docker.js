'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.helpFa = OD.helpFa || {};
  Object.assign(OD.helpFa, {
    'docker/overview': {
      title: 'Overview (نمای کلی)',
      summary: 'صفحه اصلی فضای کاری Docker. نشان می‌دهد موتور Docker در دسترس است یا نه و در یک صفحه تصویری کلی از container ها، image ها، CPU، حافظه، دیسک و فعالیت‌های اخیر موتور به شما می‌دهد.',
      whenToUse: [
        'وقتی OpsDeck را باز می‌کنید و می‌خواهید بدانید Docker سالم است یا نه.',
        'برای دیدن اینکه Docker همین حالا چقدر CPU، حافظه و دیسک مصرف می‌کند.',
        'برای رفتن سریع به یک کار رایج: اجرای container، باز کردن ترمینال یا ادامه یک درس.',
        'برای بررسی اینکه تازه روی موتور چه اتفاقی افتاده است (container های شروع‌شده، image های pull‌شده، network های ساخته‌شده).',
      ],
      howItWorks: [
        'OpsDeck با اجرای ابزار خط فرمان Docker و یک فهرست ثابت از آرگومان‌ها (هرگز از طریق shell) با موتور Docker محلی ارتباط می‌گیرد. هنگام باز شدن صفحه، نمای کلی موتور و فهرست container ها با هم بارگذاری می‌شوند.',
        'این صفحه با تایمر خودش را تازه نمی‌کند. برای بارگذاری دوباره، دوباره روی گزینه Overview در نوار کناری کلیک کنید. OpsDeck در پس‌زمینه هر ۳۰ ثانیه موتور را بررسی می‌کند؛ اگر Docker از حالت آفلاین به آنلاین (یا برعکس) برود، Overview خودش دوباره رسم می‌شود.',
        'نمودارهای Engine load از نمونه‌هایی ساخته می‌شوند که OpsDeck در زمان باز بودن جمع می‌کند (۶۰ نمونه آخر). بعد از اجرای برنامه خالی شروع می‌شوند و با استفاده از صفحه‌های Monitoring و Overview پر می‌شوند.',
        'اگر Docker اجرا نباشد، به‌جای صفحه عادی صفحه Engine offline نمایش داده می‌شود. هیچ داده ناقص یا قدیمی نشان داده نمی‌شود.',
      ],
      parts: [
        {
          name: 'Engine offline screen (صفحه آفلاین بودن موتور)',
          description: 'وقتی موتور Docker پاسخ نمی‌دهد (Docker Desktop یا سرویس Docker متوقف است، یا روی socket دسترسی ندارید) به‌جای صفحه عادی نمایش داده می‌شود. همه صفحه‌های Docker از همین صفحه استفاده می‌کنند.',
          items: [
            { name: 'Reason text (متن علت)', description: 'خطایی که موتور برگردانده است، مثلاً "Cannot connect to the Docker daemon". اگر چیزی برنگشته باشد، یک راهنمای کلی نشان داده می‌شود.' },
            { name: 'Retry connection button', description: 'موتور را دوباره بررسی می‌کند و صفحه را دوباره رسم می‌کند. بعد از روشن کردن Docker از آن استفاده کنید.' },
            { name: 'Troubleshooting button', description: 'راهنماهای عیب‌یابی Academy را باز می‌کند.' },
            { name: 'Docker fundamentals button', description: 'دوره Docker fundamentals را در Academy باز می‌کند.' },
            { name: 'Engine unavailable panel and guide card', description: 'یک چراغ وضعیت قرمز با توضیح کوتاه. اگر متن خطا با یک مشکل شناخته‌شده مطابقت داشته باشد، کارتی در پایین چهار مرحله اول رفع مشکل را فهرست می‌کند و دکمه Open guide راهنمای کامل را باز می‌کند.' },
          ],
        },
        {
          name: 'Hero banner (بنر بالای صفحه)',
          description: 'یک خوشامدگویی با نام دستگاه شما، عنوان "Your Docker workspace is ready." و جمله‌ای مثل "3 containers are running across default with Docker 27.3.1".',
          items: [
            { name: 'New container button', description: 'پنجره Run a container را باز می‌کند (همان پنجره صفحه Containers).' },
            { name: 'Ask AI about this workspace button', description: 'دستیار هوش مصنوعی را با اطلاعات زنده فضای کاری Docker باز می‌کند. فقط وقتی داخل دستیار Send را بزنید داده ارسال می‌شود. برای تنظیم آن به Settings بروید.' },
            { name: 'Open terminal button', description: 'به صفحه Docker Terminal می‌رود.' },
            { name: 'Continue learning button', description: 'درس تمام‌نشده بعدی Academy را باز می‌کند، یا اگر هنوز شروع نکرده‌اید صفحه اصلی Academy را.' },
            { name: 'Engine checked line', description: 'مشخص می‌کند نمای کلی موتور چند وقت پیش خوانده شده، مثلاً "Engine checked 2 minutes ago".' },
            { name: 'ExecFile only - no shell line', description: 'یادآوری مدل ایمنی: Docker همیشه با فهرست آرگومان‌ها اجرا می‌شود، نه از طریق shell.' },
            { name: 'Day streak line', description: 'تعداد روزهای پیاپی یادگیری شما در Academy.' },
          ],
        },
        {
          name: 'Engine panel (پنل موتور، بالا سمت راست)',
          description: 'یک چراغ سبز چشمک‌زن با عبارت "Docker Engine 27.3.1" و جمله "Daemon reachable over default context"، به‌همراه نسخه Compose در صورت نصب بودن Docker Compose.',
          items: [
            { name: 'API', description: 'نسخه API ای از Docker که موتور از آن پشتیبانی می‌کند، مثلاً 1.47.' },
            { name: 'Platform', description: 'سیستم‌عامل و معماری CPU موتور، مثلاً linux / amd64.' },
            { name: 'CPUs', description: 'تعداد CPU هایی که در اختیار Docker است.' },
            { name: 'Logging', description: 'logging driver پیش‌فرض، مثلاً json-file. تعیین می‌کند لاگ container ها کجا ذخیره شوند.' },
          ],
        },
        {
          name: 'Four stat cards (چهار کارت آماری)',
          description: 'عددهای سریع همراه با خط روند کوچک برای نمونه‌های اخیر.',
          items: [
            { name: 'Containers running', description: 'تعداد container های در حال اجرا و زیر آن "N total - N stopped"، مثلاً "4 running, 7 total - 3 stopped".' },
            { name: 'Images', description: 'تعداد image های موجود در محل ذخیره image های محلی.' },
            { name: 'Aggregate CPU', description: 'مجموع CPU مصرفی همه container های در حال اجرا، مثلاً 12.4%. اگر container ها چند هسته را استفاده کنند می‌تواند بیشتر از 100% باشد.' },
            { name: 'Memory in use', description: 'مجموع حافظه مصرفی container های در حال اجرا و اینکه چند درصد از حافظه دستگاه است، مثلاً "1.8 GB, 11.2% of 16 GB".' },
          ],
        },
        {
          name: 'Engine load card (کارت بار موتور)',
          description: 'دو نمودار سطحی برای CPU و Memory که تقریباً یک دقیقه اخیر را پوشش می‌دهند ("60s" سمت چپ، "now" سمت راست). نشان Live سبز یعنی داده واقعی است، نه نمایشی. نشانگر ماوس را روی نمودار ببرید تا مقدار را ببینید.',
        },
        {
          name: 'Running containers card (کارت container های در حال اجرا)',
          description: 'جدول کوتاهی از شش container اول که Docker برمی‌گرداند و در زیرعنوان تعدادی مثل "3 active". دکمه Open manager به صفحه کامل Containers می‌رود. اگر container ای نباشد، حالت خالی دکمه Run a container را پیشنهاد می‌دهد.',
          items: [
            { name: 'Container column', description: 'نام container و زیر آن image اش، همراه با یک نقطه رنگی برای وضعیت.' },
            { name: 'State column', description: 'نشان وضعیت مثل running، exited، paused یا created.' },
            { name: 'Ports column', description: 'حداکثر دو port منتشرشده، مثلاً 0.0.0.0:8080->80/tcp.' },
            { name: 'CPU column', description: 'درصد CPU در لحظه بارگذاری صفحه.' },
            { name: 'Created column', description: 'مدت زمانی که از ساخت container گذشته است.' },
          ],
        },
        {
          name: 'Recent engine events card (کارت رویدادهای اخیر موتور)',
          description: 'فعالیت یک ساعت اخیر Docker، حداکثر هشت خط؛ هر خط یک آیکون (container، image، network، volume)، عمل و نام شیء مثل "start web-1"، نوع رویداد و زمان وقوع دارد. دکمه All events صفحه Events را باز می‌کند.',
        },
        {
          name: 'Disk usage card (کارت مصرف دیسک)',
          description: 'برای هر نوع داده Docker یک ردیف (Images، Containers، Local volumes، Build cache) با یک نوار، اندازه کل و مقداری که قابل بازیابی است ("1.2 GB free"). زیرعنوان مجموع فضای قابل بازیابی را نشان می‌دهد. دکمه Manage، Settings را باز می‌کند.',
        },
        {
          name: 'Continue learning card (کارت ادامه یادگیری)',
          description: 'وقتی درسی در Academy نوبت بعدی باشد نمایش داده می‌شود. عنوان درس، دوره، مدت و درصد پیشرفت کلی شما را نشان می‌دهد. برای ادامه روی آن کلیک کنید.',
        },
        {
          name: 'Quick actions card (کارت اقدام‌های سریع)',
          description: 'شش کاشی میان‌بر: Containers، Compose projects، Images، Live monitoring، Guided labs و CLI reference.',
        },
      ],
      example: {
        title: 'مثال: بررسی سلامت Docker بعد از ری‌استارت',
        steps: [
          'Overview را باز کنید. اگر "Docker is not reachable" دیدید، Docker Desktop یا سرویس Docker را روشن کنید و بعد روی Retry connection کلیک کنید.',
          'وقتی بنر می‌گوید "Your Docker workspace is ready."، کارت Containers running را بخوانید، مثلاً "2 running, 5 total".',
          'به Disk usage نگاه کنید. اگر "6.4 GB reclaimable" نوشته بود، Images را باز کنید و با Free space بررسی کنید چه چیزهایی را می‌توان حذف کرد.',
          'در Recent engine events دنبال خط‌هایی مثل "die api-1" بگردید. یعنی یک container متوقف شده؛ Containers و بخش Logs آن را باز کنید تا علتش را بفهمید.',
        ],
      },
      tips: [
        'Overview فقط‌خواندنی است. هیچ چیز در اینجا container های شما را تغییر نمی‌دهد، به‌جز دکمه New container که قبل از اجرا تأیید می‌گیرد.',
        'درصد حافظه نسبت به کل حافظه دستگاه شما سنجیده می‌شود، نه نسبت به محدودیت یک container.',
        'اگر Docker نصب است ولی خطای دسترسی می‌گیرید، کارت راهنما در صفحه آفلاین راه‌حل معمول را توضیح می‌دهد (افزودن کاربر خود به گروه docker).',
      ],
    },

    'docker/insights': {
      title: 'Docker Intelligence (هوش Docker)',
      summary: 'یک بررسی خودکار از سلامت و نظم تنظیمات Docker شما. container ها، image ها، volume ها، network ها و پروژه‌های Compose را می‌خواند و مشکلات امنیتی، فضای هدررفته و تنظیمات پرخطر را فهرست می‌کند و به هر container در حال اجرا یک نمره می‌دهد.',
      whenToUse: [
        'قبل از استقرار یا به‌اشتراک‌گذاری یک پیکربندی، برای پیدا کردن container های privileged یا Docker socket های mount‌شده.',
        'وقتی دیسک پر می‌شود و می‌خواهید بدانید کدام image ها، volume ها و network ها بلااستفاده‌اند.',
        'برای پیدا کردن container هایی که محدودیت حافظه یا CPU ندارند، restart policy ندارند، یا در حلقه ری‌استارت گیر کرده‌اند.',
        'برای مقایسه متغیرهای محیطی بین سرویس‌های یک پروژه Compose.',
      ],
      howItWorks: [
        'این صفحه یک عکس لحظه‌ای از آنچه موتور گزارش می‌دهد را تحلیل می‌کند. کاملاً فقط‌خواندنی است: هیچ چیز از این صفحه تغییر نمی‌کند، شروع نمی‌شود یا حذف نمی‌شود.',
        'نتیجه حدود ۲۰ ثانیه کش می‌شود و تا وقتی صفحه باز است هر ۹۰ ثانیه خودکار تازه می‌شود. برای تحلیل دوباره همین حالا Refresh را بزنید. پاورقی می‌گوید آخرین تحلیل کی انجام شده، مثلاً "Analysed 1 minute ago - read-only snapshot".',
        'مقادیری که قابل اندازه‌گیری نبوده‌اند به‌صورت unknown گزارش می‌شوند، نه سالم. کارت Limitations در پایین هر چیزی را که رد شده فهرست می‌کند، مثلاً "inspect data was unavailable for 2 containers".',
        'اگر تحلیل شکست بخورد یا Docker آفلاین باشد، صفحه Analysis unavailable را می‌بینید که دکمه‌ای برای باز کردن فضای کاری Docker دارد.',
      ],
      parts: [
        {
          name: 'Header actions (اقدام‌های سربرگ)',
          description: 'کنترل‌های بالا سمت راست.',
          items: [
            { name: 'Cross-module view button', description: 'نمای کلی Intelligence را باز می‌کند که Docker، Kubernetes، Databases و Observability را با هم ترکیب می‌کند.' },
            { name: 'Refresh button', description: 'تحلیل را بلافاصله دوباره اجرا می‌کند.' },
          ],
        },
        {
          name: 'Five stat cards (پنج کارت آماری)',
          description: 'مجموع‌ها در یک نگاه.',
          items: [
            { name: 'Containers', description: 'تعداد کل container ها و اینکه چندتا در حال اجرا هستند.' },
            { name: 'Images', description: 'تعداد image ها، تعداد dangling ها (بدون tag) و اندازه کل، مثلاً "3 dangling - 4.2 GB".' },
            { name: 'Security findings', description: 'تعداد یافته‌های critical (اگر بیشتر از صفر باشد قرمز می‌شود)، به‌علاوه تعداد هشدارها و میانگین نمره امنیتی container ها.' },
            { name: 'Storage & networks', description: 'تعداد کل volume ها، همراه با تعداد volume ها و network های بلااستفاده.' },
            { name: 'Compose projects', description: 'تعداد پروژه‌های Compose و اینکه چندتا نیمه‌خاموش هستند (container های در حال اجرا کمتر از انتظار).' },
          ],
        },
        {
          name: 'Findings card (کارت یافته‌ها)',
          description: 'فهرست اصلی. هر ردیف یک نشان شدت، عنوان، یک جمله توضیح، شاهد اختیاری (یک عدد یا فهرستی از نام‌ها)، نام منبع و دکمه Open دارد که شما را به صفحه‌ای می‌برد که می‌توانید مشکل را رفع کنید. چیپ‌های شمارنده در سربرگ کارت نشان می‌دهند از هر شدت چند یافته وجود دارد.',
          items: [
            { name: 'Critical', description: 'مشکل جدی، مثلاً یک container از نوع privileged یا Docker socket mount‌شده. اول این‌ها را رفع کنید.' },
            { name: 'Warning', description: 'باید رفع شود، مثلاً container ای که با root اجرا می‌شود، image های dangling یا حلقه‌های ری‌استارت.' },
            { name: 'Info', description: 'پیشنهاد روش خوب، مثلاً "No memory limit" یا "Mutable latest tag".' },
            { name: 'Pass', description: 'بررسی‌ای که اندازه‌گیری شده و مشکلی ندارد.' },
            { name: 'Unknown', description: 'قابل اندازه‌گیری نبوده است.' },
          ],
        },
        {
          name: 'Container security card (کارت امنیت container)',
          description: 'همه container های در حال اجرا را از نظر این موارد بررسی می‌کند: حالت privileged، namespace های host network / PID / IPC، socket های Docker یا containerd که mount شده‌اند، مسیرهای حساس host (/proc، /sys، /dev)، اجرا با root، root filesystem قابل‌نوشتن، capability های اضافی Linux، device های عبوردادهشده، نبودن گزینه no-new-privileges و secret هایی که در متغیرهای محیطی ذخیره شده‌اند (مقادیر پوشانده می‌شوند).',
          items: [
            { name: 'Grade and score', description: 'هر container از 100 شروع می‌کند. هر مشکل critical مقدار 35، هر warning مقدار 15 و هر info مقدار 5 کم می‌کند. نمره‌ها: A از 90 به بالا، B از 75 به بالا، C از 60 به بالا، D از 40 به بالا، F زیر 40.' },
            { name: 'Issues badges', description: 'برای هر مشکل یک نشان، با رنگ قرمز، نارنجی یا فیروزه‌ای بسته به شدت. "No issues" سبز یعنی چیزی پیدا نشده است.' },
          ],
        },
        {
          name: 'Image hygiene and Compose projects',
          description: 'دو کارت کنار هم. Image hygiene، image ها را با اندازه و نشان Dangling یا Tagged فهرست می‌کند؛ دکمه Open images به صفحه Images می‌رود. Compose projects هر پروژه را با تعداد container های running / total و فایل‌های پیکربندی‌اش فهرست می‌کند؛ Open Compose به صفحه Compose می‌رود.',
        },
        {
          name: 'Resource hygiene card',
          description: 'دو جدول کوچک: volume ها (نام، driver، mountpoint، اندازه) و network ها (نام، driver، scope، subnet). داده‌هایی را که فعلاً هیچ container ای استفاده نمی‌کند برجسته می‌کنند.',
        },
        {
          name: 'Optimizer card',
          description: 'تعداد container ها، تعداد بررسی‌شده‌ها، تعداد بدون محدودیت حافظه، بدون محدودیت CPU و تعداد در حال ری‌استارت را می‌شمارد. وقتی سه container یا بیشتر تقریباً هیچ CPU (زیر 1%) و حافظه (زیر 5%) مصرف کنند، جدول "Nearly idle containers" با میزان مصرف آن‌ها ظاهر می‌شود.',
        },
        {
          name: 'Environment comparison card',
          description: 'برای هر پروژه Compose سرویس‌ها، image، تعداد کلیدهای متغیر محیطی، محدودیت حافظه و restart policy را فهرست می‌کند. اگر سرویس‌های یک پروژه درباره یک متغیر اختلاف داشته باشند (مثلاً LOG_LEVEL در یکی "debug" و در دیگری "info" باشد، یا در یکی تعریف نشده باشد)، جدول Variable / Values تفاوت را نشان می‌دهد. مقدارهای secret پوشانده می‌مانند.',
        },
        {
          name: 'Limitations card',
          description: 'فهرست چیزهایی که تحلیل نتوانسته ببیند، تا بدانید نتیجه چقدر کامل است.',
        },
      ],
      tables: [
        {
          name: 'Container security table',
          columns: [
            { name: 'Container', meaning: 'نام container همراه با image آن به رنگ خاکستری.', example: 'api-1 - myorg/api:1.4.0' },
            { name: 'Grade', meaning: 'نمره حرفی از A (بهترین) تا F.', example: 'C' },
            { name: 'Score', meaning: 'عددی که پشت نمره حرفی است، از 100 رو به پایین.', example: '70' },
            { name: 'Project', meaning: 'پروژه Compose ای که container به آن تعلق دارد، در صورت وجود.', example: 'shop' },
            { name: 'Issues', meaning: 'نشان‌هایی برای هر مشکل پیدا‌شده.', example: 'Runs as root, No no-new-privileges option' },
          ],
        },
        {
          name: 'Image hygiene table',
          columns: [
            { name: 'Image', meaning: 'repository و tag.', example: 'nginx:latest' },
            { name: 'Size', meaning: 'اندازه روی دیسک.', example: '188MB' },
            { name: 'State', meaning: 'Dangling یعنی بدون tag و بدون ارجاع؛ Tagged یک image عادی است.', example: 'Dangling' },
          ],
        },
        {
          name: 'Compose projects table',
          columns: [
            { name: 'Project', meaning: 'نام پروژه Compose.', example: 'shop' },
            { name: 'Running', meaning: 'تعداد container های در حال اجرا از کل container های پروژه.', example: '2 / 3' },
            { name: 'Config files', meaning: 'فایل‌های Compose ای که پروژه با آن‌ها شروع شده است.', example: '/home/me/shop/compose.yaml' },
          ],
        },
        {
          name: 'Volumes table (Resource hygiene)',
          columns: [
            { name: 'Volume', meaning: 'نام volume.', example: 'shop_db-data' },
            { name: 'Driver', meaning: 'storage driver.', example: 'local' },
            { name: 'Mountpoint', meaning: 'محلی که داده روی host قرار دارد.', example: '/var/lib/docker/volumes/shop_db-data/_data' },
            { name: 'Size', meaning: 'اندازه‌ای که Docker گزارش می‌دهد.', example: '340MB' },
          ],
        },
        {
          name: 'Networks table (Resource hygiene)',
          columns: [
            { name: 'Network', meaning: 'نام network.', example: 'shop_default' },
            { name: 'Driver', meaning: 'network driver.', example: 'bridge' },
            { name: 'Scope', meaning: 'local یا swarm.', example: 'local' },
            { name: 'Subnet', meaning: 'بازه آدرس network.', example: '172.18.0.0/16' },
          ],
        },
        {
          name: 'Nearly idle containers table',
          columns: [
            { name: 'Container', meaning: 'نام container.', example: 'cron-1' },
            { name: 'CPU', meaning: 'درصد CPU.', example: '0.1%' },
            { name: 'Memory', meaning: 'درصد حافظه نسبت به host.', example: '0.8%' },
          ],
        },
        {
          name: 'Environment comparison tables',
          columns: [
            { name: 'Service', meaning: 'نام سرویس Compose.', example: 'web' },
            { name: 'Image', meaning: 'image ای که سرویس اجرا می‌کند.', example: 'myorg/web:2.0' },
            { name: 'Env keys', meaning: 'تعداد متغیرهای محیطی تنظیم‌شده.', example: '12' },
            { name: 'Memory limit', meaning: 'محدودیت حافظه تنظیم‌شده، یا خط تیره اگر نباشد.', example: '512 MB' },
            { name: 'Restart policy', meaning: 'کاری که Docker وقتی container متوقف می‌شود انجام می‌دهد.', example: 'unless-stopped' },
            { name: 'Variable / Values', meaning: 'فقط وقتی سرویس‌ها اختلاف دارند: نام متغیر و مقدار هر سرویس، یا "not set".', example: 'LOG_LEVEL: web=debug, worker=info' },
          ],
        },
      ],
      example: {
        title: 'مثال: رفع یک یافته critical',
        steps: [
          'Intelligence را باز کنید و به کارت Security findings نگاه کنید. 1 critical نشان می‌دهد.',
          'در Findings ردیف قرمز "Container runtime socket mounted - api-1" را بخوانید. یعنی container، فایل /var/run/docker.sock را mount کرده و می‌تواند موتور را کنترل کند.',
          'روی Open کلیک کنید تا به Containers بروید، api-1 را inspect کنید و Mounts آن را ببینید، سپس آن mount را از دستور run یا فایل Compose حذف کنید و container را دوباره بسازید.',
          'برگردید و Refresh را بزنید. نمره api-1 در Container security باید بهتر شده باشد.',
        ],
      },
      tips: [
        'یافته‌های Info مثل "Mutable latest tag" توصیه‌اند، نه خطا. برای تکرارپذیر کردن استقرارها یک نسخه یا digest را ثابت (pin) کنید.',
        'یافته درباره image ها یا volume های بلااستفاده یعنی «بررسی کنید»، نه «حذف کنید». ممکن است یک container متوقف یا یک build هنوز به آن‌ها نیاز داشته باشد.',
        'فقط container های در حال اجرا نمره می‌گیرند. یک container را شروع کنید، بعد Refresh بزنید تا در جدول امنیت ظاهر شود.',
      ],
    },

    'docker/containers': {
      title: 'Containers (کانتینرها)',
      summary: 'همه container های موتور Docker را فهرست کنید، بررسی کنید و کنترل کنید: شروع، توقف موقت، ری‌استارت، باز کردن shell، خواندن لاگ، حذف و ساخت container جدید.',
      whenToUse: [
        'برای شروع، توقف موقت، ری‌استارت یا حذف یک container.',
        'برای خواندن لاگ container ای که کرش کرده یا درست کار نمی‌کند.',
        'برای باز کردن shell داخل یک container در حال اجرا و گشتن در آن.',
        'برای باز کردن وب‌سایت یک container در Firefox.',
        'برای دیدن اینکه کدام container ها به کدام پروژه Compose تعلق دارند، یا کدام container ها از یک image مشخص استفاده می‌کنند.',
      ],
      howItWorks: [
        'فهرست هنگام باز شدن صفحه از موتور Docker خوانده می‌شود، همراه با عددهای زنده CPU و حافظه برای container های در حال اجرا. صفحه خودکار تازه نمی‌شود: برای دیدن داده جدید Refresh را بزنید (یا یک اقدام انجام دهید که فهرست را دوباره بارگذاری می‌کند).',
        'جستجو، چیپ‌های وضعیت، انتخابگر پروژه و گروه‌بندی، فهرست را فوراً و داخل خود صفحه فیلتر می‌کنند، بدون اینکه دوباره از Docker سؤال شود.',
        'کلیک روی هر جای یک ردیف (به‌جز دکمه‌هایش) کشوی جزئیات container را باز می‌کند.',
        'اقدام‌های مخرب تأیید می‌گیرند و دقیقاً دستور Docker ای را که اجرا می‌شود نشان می‌دهند.',
        'انتخاب شما برای Group by project بین اجراهای برنامه به خاطر سپرده می‌شود.',
      ],
      parts: [
        {
          name: 'Page header (سربرگ صفحه)',
          description: 'عنوان، توضیح کوتاه، دو دکمه اصلی و یک دکمه Ask AI.',
          items: [
            { name: 'Run container button', description: 'پنجره Run a container را باز می‌کند (در ادامه توضیح داده شده).' },
            { name: 'Refresh button', description: 'container ها و CPU / حافظه آن‌ها را دوباره بارگذاری می‌کند.' },
            { name: 'Ask AI button', description: 'دستیار هوش مصنوعی را برای این صفحه و با فهرست container ها به‌عنوان زمینه باز می‌کند. فقط وقتی Send را بزنید داده ارسال می‌شود.' },
          ],
        },
        {
          name: 'Search box (کادر جستجو)',
          description: 'همزمان با تایپ شما بر اساس نام container، image، ID، پروژه Compose و نام سرویس فیلتر می‌کند. کلید / را روی صفحه‌کلید بزنید تا مستقیم وارد آن شوید.',
        },
        {
          name: 'State chips (چیپ‌های وضعیت)',
          description: 'All، Running، Exited، Paused و Created، هرکدام با یک شمارنده. روی یکی کلیک کنید تا فقط container های آن وضعیت نمایش داده شوند. Running یعنی فرایند فعال است؛ Exited یعنی متوقف شده (تمام شده یا کرش کرده)؛ Paused یعنی منجمد شده؛ Created یعنی وجود دارد ولی هرگز شروع نشده است.',
        },
        {
          name: 'Image filter chip (چیپ فیلتر image)',
          description: 'وقتی با گزینه "Show containers using this image" از صفحه Images می‌آیید ظاهر می‌شود. نام image را با یک x نشان می‌دهد. برای پاک کردن فیلتر روی آن کلیک کنید. شمارنده بعد از آن مثلاً "2 of 9 containers" می‌خواند.',
        },
        {
          name: 'Project selector and Group by project',
          description: 'فقط وقتی نمایش داده می‌شود که container ها از بیش از یک گروه باشند (مثلاً دو پروژه Compose، یا Compose به‌علاوه container های مستقل). انتخابگر "All projects (9)" یا یک پروژه را با تعدادش نشان می‌دهد. Group by project ردیف‌های بخش‌بندی را روشن می‌کند: هر پروژه یک سربرگ با تعداد container ها، تعداد سرویس‌ها، تعداد در حال اجرا و دکمه Show only this project می‌شود. container هایی که با Compose شروع نشده‌اند زیر "Standalone" قرار می‌گیرند.',
        },
        {
          name: 'Counter (شمارنده)',
          description: 'متن کوچک سمت راست نوار ابزار، مثل "shop - 4 containers".',
        },
        {
          name: 'Row actions (انتهای راست هر ردیف)',
          description: 'دکمه‌ها به وضعیت container بستگی دارند.',
          items: [
            { name: 'Pause / Start', description: 'container های در حال اجرا Pause نشان می‌دهند (همه فرایندها را منجمد می‌کند). هر container ای که در حال اجرا نباشد Start نشان می‌دهد.' },
            { name: 'Restart', description: 'فقط برای container های در حال اجرا. container را متوقف و دوباره شروع می‌کند.' },
            { name: 'Open in Firefox (globe icon)', description: 'فقط اگر container دست‌کم یک port از نوع TCP منتشر کرده باشد نمایش داده می‌شود. آدرس http://localhost:PORT را در Firefox باز می‌کند (برای port های 443 و 8443 از https). اگر چند port منتشر شده باشد، یک پنجره می‌پرسد کدام. تا وقتی container در حال اجرا نباشد غیرفعال است.' },
            { name: 'Open shell (terminal icon)', description: 'یک shell تعاملی داخل container باز می‌کند. اگر container در حال اجرا نباشد غیرفعال است. به بخش "Container shell" در ادامه نگاه کنید.' },
            { name: 'Logs', description: 'کشوی لاگ را باز می‌کند (در ادامه توضیح داده شده).' },
            { name: 'Ask AI (sparkles icon)', description: 'بعد از زدن Send، درباره همین یک container با لاگ‌های زنده، آمار و داده‌های inspect آن از هوش مصنوعی سؤال می‌کند.' },
            { name: 'Remove (red trash icon)', description: 'تأیید می‌گیرد، سپس docker rm -f را روی container اجرا می‌کند. container و لایه قابل‌نوشتن آن حذف می‌شوند. volume های نام‌دار حفظ می‌شوند.' },
          ],
        },
        {
          name: 'Run a container dialog (پنجره اجرای container)',
          description: 'فرمی که یک دستور docker run -d می‌سازد. یک خط پیش‌نمایش زنده زیر فرم، دقیقاً دستور را همزمان با تایپ شما نشان می‌دهد. بعد از زدن Run in terminal، یک تأیید دوم قبل از اجرای هر چیز دوباره دستور را نشان می‌دهد.',
          items: [
            { name: 'Image', description: 'الزامی. با alpine:3.20 (یا image ای که در صفحه Images انتخاب کرده‌اید) پر شده است. مثال: nginx:1.27-alpine.' },
            { name: 'Name (optional)', description: 'به --name تبدیل می‌شود. مثال: my-web.' },
            { name: 'Port mapping', description: 'به -p تبدیل می‌شود. قالب host:container، مثلاً 127.0.0.1:8080:80. گذاشتن 127.0.0.1 در ابتدا port را فقط برای دستگاه خودتان خصوصی نگه می‌دارد.' },
            { name: 'Environment', description: 'جفت‌های KEY=value جداشده با ویرگول؛ هرکدام به -e تبدیل می‌شود. مثال: LOG_LEVEL=info, TZ=UTC.' },
            { name: 'Command (optional)', description: 'دستور پیش‌فرض image را جایگزین می‌کند. مثال: sh -c \'echo hello\'.' },
            { name: 'Run in terminal button', description: 'تأیید می‌گیرد و بعد دستور را اجرا می‌کند. در صورت موفقیت، یک toast شناسه container جدید را نشان می‌دهد.' },
          ],
        },
        {
          name: 'Container detail drawer (با کلیک روی یک ردیف)',
          description: 'یک پنل کناری با هر چیزی که Docker درباره یک container می‌داند، معادل docker inspect.',
          items: [
            { name: 'Header', description: 'نام، ID، image و یک نشان وضعیت.' },
            { name: 'Runtime', description: 'Created، Started، Exit code (0 یعنی خروج تمیز، 137 معمولاً یعنی کشته شده یا حافظه تمام شده)، Restart policy، PID و Platform.' },
            { name: 'Command', description: 'Entrypoint، Cmd، Working dir و User (اگر خالی باشد root است).' },
            { name: 'Environment table', description: 'جفت‌های Key / Value تنظیم‌شده در container، همراه با تعداد متغیرها.' },
            { name: 'Mounts table', description: 'مقصد داخل container، Type (volume یا bind)، Source / نام روی host و Mode (rw خواندن‌ونوشتن، ro فقط‌خواندنی).' },
            { name: 'Networks table', description: 'هر network ای که container روی آن است، با IP، gateway و آدرس MAC.' },
            { name: 'Labels', description: 'همه label ها به‌صورت نشان‌های key=value. Compose label هایی مثل com.docker.compose.project اضافه می‌کند.' },
            { name: 'Footer buttons', description: 'Ask AI، Explain this container (یک درس مرتبط در Academy را باز می‌کند)، Open in Firefox (وقتی container اجرا می‌شود و port منتشرشده دارد)، Copy inspect command، Close.' },
          ],
        },
        {
          name: 'Logs drawer (کشوی لاگ)',
          description: 'خروجی container (stdout و stderr) را با زمان‌نگاشت در یک نمای قابل‌پیمایش نشان می‌دهد. هر ۶ ثانیه خودش دوباره بارگذاری می‌شود و تا وقتی در پایین می‌مانید انتهای لاگ را دنبال می‌کند.',
          items: [
            { name: 'Tail selector', description: 'چند خط آخر خوانده شود: 100، 300 (پیش‌فرض)، 600 یا 1200.' },
            { name: 'Refresh button', description: 'لاگ‌ها را همین حالا دوباره بارگذاری می‌کند.' },
            { name: 'Latest button', description: 'وقتی به بالا اسکرول کنید ظاهر می‌شود. کلیک کنید تا به تازه‌ترین خط برگردید و دنبال کردن ادامه پیدا کند.' },
            { name: 'Footer', description: 'دستور docker logs استفاده‌شده را نشان می‌دهد، همراه با Ask AI، لینک درس Debugging و Copy command.' },
            { name: 'Empty state', description: '"No log output" یعنی container چیزی در stdout یا stderr ننوشته است.' },
          ],
        },
        {
          name: 'Container shell (shell داخل container)',
          description: 'کشویی با یک ترمینال متصل به container (مثل docker exec -it ... bash). اگر سیستم شما پشتیبانی کند، یک ترمینال تعاملی کامل با تکمیل خودکار با Tab، تاریخچه، رنگ‌ها و Ctrl+C می‌گیرید. در غیر این صورت یک shell ساده‌تر خط‌به‌خط با اعلان "$"، دکمه Run، تاریخچه با فلش‌های Up/Down و Ctrl+L برای پاک کردن می‌گیرید. بستن کشو، نشست را تمام می‌کند.',
          items: [
            { name: 'Full terminal controls', description: 'کپی انتخاب (Ctrl+Shift+C)، چسباندن (Ctrl+Shift+V)، کلید تمام‌صفحه و Esc برای خروج از تمام‌صفحه. برچسب وضعیت اول connecting و بعد وضعیت نشست را نشان می‌دهد.' },
            { name: 'Footer', description: 'دستور معادل docker exec، دکمه Ask AI و لینک درس را نشان می‌دهد.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Containers table',
          description: 'یک ردیف برای هر container. برای دیدن جزئیات روی ردیف کلیک کنید.',
          columns: [
            { name: 'Container', meaning: 'یک نقطه رنگی برای وضعیت، نام container با فونت درشت و image آن در زیرش.', example: 'web-1 / nginx:1.27-alpine' },
            { name: 'State', meaning: 'نشان وضعیت با متن وضعیت Docker.', example: 'running (Up 3 hours) or exited (Exited (137) 2 minutes ago)' },
            { name: 'Ports', meaning: 'حداکثر دو نگاشت port منتشرشده؛ بقیه به‌صورت نشان +N نمایش داده می‌شوند. قالب host:port->container-port/protocol.', example: '0.0.0.0:8080->80/tcp +1' },
            { name: 'CPU / memory', meaning: 'درصد زنده CPU و زیر آن حافظه مصرفی. container های متوقف 0.0% نشان می‌دهند.', example: '1.8% / 42 MB' },
            { name: 'Uptime', meaning: 'مدتی که container در حال اجراست، یا اگر اجرا نمی‌شود مدتی که از ساختش گذشته است.', example: 'Up 3 hours' },
            { name: 'Project', meaning: 'پروژه و سرویس Compose به‌صورت نشان بنفش. روی آن کلیک کنید تا فقط همان پروژه نمایش داده شود. خط تیره یعنی container مستقل.', example: 'shop/web' },
            { name: 'Actions (unlabeled)', meaning: 'دکمه‌های ردیف که بالاتر توضیح داده شد.', example: 'Pause, Restart, Open in Firefox, Open shell, Logs, Ask AI, Remove' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن علت کرش مداوم یک container',
        steps: [
          'Containers را باز کنید و روی چیپ Exited کلیک کنید. api-1 را با وضعیت "Exited (1) 40 seconds ago" می‌بینید.',
          'روی دکمه Logs همان ردیف کلیک کنید. چند خط آخر را بخوانید؛ مثلاً "Error: connect ECONNREFUSED db:5432" یعنی پایگاه داده هنوز آماده نبوده است.',
          'روی ردیف کلیک کنید تا کشوی جزئیات باز شود و Environment و Networks را بررسی کنید (آیا روی همان network ای است که db هست؟).',
          'روی ردیف Start را بزنید تا دوباره تلاش کند، یا پیکربندی را درست کنید و container را دوباره بسازید. اگر نظر دوم می‌خواهید از Ask AI استفاده کنید.',
        ],
      },
      tips: [
        'Remove از docker rm -f استفاده می‌کند، پس container در حال اجرا بلافاصله متوقف می‌شود. داده‌های داخل volume نام‌دار می‌مانند؛ داده‌ای که فقط داخل container نوشته شده از بین می‌رود.',
        'پایگاه داده را روی 0.0.0.0 منتشر نکنید. از نگاشت port ای مثل 127.0.0.1:5432:5432 استفاده کنید تا فقط دستگاه خودتان به آن دسترسی داشته باشد.',
        'CPU برای container های چندنخی می‌تواند از 100% بیشتر شود؛ 200% یعنی دو هسته کامل.',
        'Open in Firefox به نصب بودن Firefox نیاز دارد. اگر شکست بخورد، یک toast قرمز علتش را توضیح می‌دهد.',
        'پنجره Run a container همه گزینه‌های docker run را پشتیبانی نمی‌کند. برای کارهای پیشرفته از صفحه Terminal استفاده کنید.',
      ],
    },

    'docker/images': {
      title: 'Images (ایمیج‌ها)',
      summary: 'همه چیزهایی که در محل ذخیره image های محلی شماست: هر image از کجا آمده، چقدر حجم دارد و کدام container ها از آن استفاده می‌کنند. image جدید pull کنید، tag بزنید، لایه‌ها را بررسی کنید و image های قدیمی را پاک کنید.',
      whenToUse: [
        'برای دانلود (pull) یک image از registry.',
        'برای آزاد کردن فضای دیسک با حذف image هایی که دیگر لازم ندارید.',
        'برای ساخت یک container از یک image.',
        'برای دیدن نحوه ساخته شدن یک image (تاریخچه لایه‌ها) یا افزودن tag جدید به آن.',
        'برای پیدا کردن اینکه کدام container ها از یک image مشخص استفاده می‌کنند.',
      ],
      howItWorks: [
        'فهرست هنگام باز شدن صفحه از موتور Docker می‌آید. برای بارگذاری دوباره Refresh را بزنید یا یک اقدام انجام دهید. جستجو و چیپ‌های فیلتر روی فهرست بارگذاری‌شده فوراً کار می‌کنند.',
        'image یک قالب فقط‌خواندنی است که از لایه‌ها ساخته شده. چند tag (نام) می‌توانند به یک image ID اشاره کنند. image هایی که بین tag ها مشترک‌اند فقط یک‌بار روی دیسک ذخیره می‌شوند، ولی هر ردیف اندازه کامل image را نشان می‌دهد.',
        'image از نوع dangling، image ای بدون نام و بدون tag است (به‌صورت <none> نمایش داده می‌شود) و معمولاً وقتی یک tag را دوباره build می‌کنید باقی می‌ماند. معمولاً حذفش بی‌خطر است.',
        'ابزار پاک‌سازی Free space هرگز image ای را که یک container به آن ارجاع می‌دهد حذف نمی‌کند و هرگز از --force استفاده نمی‌کند. اما دکمه Remove روی یک ردیف از حذف اجباری استفاده می‌کند، پس تأیید آن را با دقت بخوانید.',
      ],
      parts: [
        {
          name: 'Header buttons (دکمه‌های سربرگ)',
          description: 'چهار اقدام در بالا سمت راست به‌علاوه دکمه Ask AI.',
          items: [
            { name: 'Pull image', description: 'یک مرجع image مثل nginx:1.27-alpine می‌پرسد، آن را اعتبارسنجی می‌کند، دستور docker pull را تأیید می‌گیرد و image را دانلود می‌کند. برای راه‌اندازی‌های تکرارپذیر به‌جای latest یک نسخه یا digest را ثابت کنید.' },
            { name: 'Free space', description: 'پنجره بررسی پاک‌سازی را باز می‌کند (در ادامه).' },
            { name: 'Prune dangling', description: 'بعد از تأیید، docker image prune --force را اجرا می‌کند و همه image های بدون tag را که هیچ‌چیز به آن‌ها ارجاع نمی‌دهد حذف می‌کند. قابل برگشت نیست.' },
            { name: 'Refresh', description: 'فهرست را دوباره بارگذاری می‌کند.' },
          ],
        },
        {
          name: 'Four stat cards (چهار کارت آماری)',
          description: 'مجموع‌ها برای کل محل ذخیره image ها.',
          items: [
            { name: 'Local images', description: 'تعداد ردیف‌های image، همراه با تعداد dangling ها.' },
            { name: 'On-disk size', description: 'مجموع اندازه همه ردیف‌ها. لایه‌هایی که بین چند image مشترک‌اند برای هر image شمرده می‌شوند، پس مصرف واقعی دیسک می‌تواند کمتر باشد.' },
            { name: 'In use', description: 'image های دارای tag که دست‌کم یک container (در حال اجرا یا متوقف) به آن‌ها ارجاع می‌دهد.' },
            { name: 'Registries', description: 'تعداد مبدأهای متمایزی که image ها از آن‌ها آمده‌اند (Docker Hub، ghcr.io، build های محلی و غیره).' },
          ],
        },
        {
          name: 'Free space available banner (بنر فضای قابل آزادسازی)',
          description: 'یک بنر زرد که وقتی image های قدیمی بلااستفاده وجود دارند ظاهر می‌شود، مثلاً "3 non-system images older than 90 days with no containers could free about 1.4 GB". دکمه Review cleanup همان پنجره Free space را باز می‌کند.',
        },
        {
          name: 'Toolbar (نوار ابزار)',
          description: 'جستجو و فیلترها.',
          items: [
            { name: 'Search box', description: 'با متن repository، tag، image ID یا registry تطبیق می‌دهد.' },
            { name: 'All chip', description: 'همه image ها را نشان می‌دهد.' },
            { name: 'In use chip', description: 'فقط image های دارای tag را نشان می‌دهد (image های dangling را پنهان می‌کند).' },
            { name: 'Dangling chip', description: 'فقط image های بدون tag را نشان می‌دهد.' },
            { name: 'Counter', description: 'مثلاً "5 of 18".' },
          ],
        },
        {
          name: 'Row actions (اقدام‌های ردیف)',
          description: 'دکمه‌ها در انتهای هر ردیف image.',
          items: [
            { name: 'Run (green play)', description: 'پنجره Run a container را با همین image از پیش پر‌شده باز می‌کند.' },
            { name: 'Show containers using this image', description: 'به صفحه Containers می‌رود که روی همین image فیلتر شده است.' },
            { name: 'History', description: 'کشویی را باز می‌کند که هر لایه image را فهرست می‌کند (در ادامه).' },
            { name: 'Tag', description: 'یک مرجع جدید می‌پرسد، مثلاً registry.example.com/app:1.4.0، و آن را به‌عنوان نام دیگری برای همان image اضافه می‌کند.' },
            { name: 'Ask AI', description: 'بعد از زدن Send، درباره image با داده‌های inspect، تاریخچه و میزان استفاده container ها از هوش مصنوعی سؤال می‌کند.' },
            { name: 'Remove (red trash)', description: 'تأیید می‌گیرد و بعد image را حذف می‌کند. اگر هنوز container ای به آن ارجاع دهد، Docker قبول نمی‌کند.' },
          ],
        },
        {
          name: 'Free up disk space dialog (پنجره آزادسازی فضای دیسک)',
          description: 'یک پاک‌سازی امن و قابل‌بررسی. تا وقتی Delete selected را نزنید و تأیید نکنید چیزی حذف نمی‌شود. یک image فقط وقتی فهرست می‌شود که image پایه رسمی نباشد (ubuntu، alpine، node، python، postgres، nginx و مشابه)، هیچ container ای (حتی متوقف) از آن استفاده نکند و از سن انتخاب‌شده قدیمی‌تر باشد. چند tag از یک image گروه‌بندی می‌شوند تا اندازه یک‌بار شمرده شود.',
          items: [
            { name: 'Older than selector', description: '1 month، 3 months (پیش‌فرض)، 6 months یا 1 year. تغییر آن فهرست را دوباره می‌سازد.' },
            { name: 'Selected summary', description: 'اندازه کل و تعداد image هایی که فعلاً تیک خورده‌اند، مثلاً "1.4 GB - 3 images selected".' },
            { name: 'Image rows', description: 'چک‌باکس، tag (یا "N tags")، ID کوتاه، سن به روز و "0 containers" و اندازه. همه ردیف‌ها از ابتدا تیک‌خورده‌اند؛ تیک آن‌هایی را که می‌خواهید نگه دارید بردارید.' },
            { name: 'Delete selected', description: 'تا وقتی چیزی تیک نخورده غیرفعال است. با دستور docker image rm تأیید می‌گیرد، بدون --force حذف می‌کند و گزارش می‌دهد چقدر فضا آزاد شد.' },
            { name: 'Empty state', description: '"Nothing to clean up" یعنی هیچ image ای همه شرایط را ندارد.' },
          ],
        },
        {
          name: 'Image history drawer (کشوی تاریخچه image)',
          description: 'لایه‌های سازنده image را از جدید به قدیم فهرست می‌کند. یک بنر هشدار می‌دهد که history جای نگهداری راز نیست: آرگومان‌ها و دستورهای build اینجا دیده می‌شوند، پس هرگز رمز عبور را داخل image نگذارید. پاورقی: Ask AI، Explain layers (درس)، Copy command، Close.',
        },
      ],
      tables: [
        {
          name: 'Images table',
          columns: [
            { name: 'Image', meaning: 'Repository:tag با فونت درشت و ID کوتاه image در زیرش. image های dangling عبارت <none>:<none> را با آیکون خاکستری نشان می‌دهند.', example: 'nginx:1.27-alpine / sha256:3b2c9a4f1d8e' },
            { name: 'Size', meaning: 'اندازه image روی دیسک.', example: '48.2MB' },
            { name: 'Created', meaning: 'مدتی که از ساخت یا انتشار image گذشته است.', example: '3 weeks ago' },
            { name: 'Containers', meaning: 'تعداد container هایی (در حال اجرا یا متوقف) که از این image ساخته شده‌اند. خط تیره یعنی Docker آن را گزارش نکرده است.', example: '2' },
            { name: 'Registry', meaning: 'مبدأ image به‌صورت نشان فیروزه‌ای. image های dangling به‌جای آن نشان خاکستری "dangling" دارند.', example: 'docker.io' },
            { name: 'Actions (unlabeled)', meaning: 'Run، Show containers، History، Tag، Ask AI، Remove.', example: '' },
          ],
        },
        {
          name: 'Image history table',
          columns: [
            { name: 'Layer', meaning: 'ID کوتاه لایه.', example: 'a1b2c3d4e5f6' },
            { name: 'Created', meaning: 'مدتی که از ساخت لایه گذشته است.', example: '3 weeks ago' },
            { name: 'Created by', meaning: 'دستور Dockerfile ای که این لایه را ساخته است.', example: 'RUN apk add --no-cache curl' },
            { name: 'Size', meaning: 'اندازه‌ای که آن لایه اضافه کرده است.', example: '4.1MB' },
          ],
        },
      ],
      example: {
        title: 'مثال: آزاد کردن 2 گیگابایت از image های قدیمی',
        steps: [
          'Images را باز کنید. یک بنر زرد می‌گوید "5 non-system images older than 90 days with no containers could free about 2.1 GB". روی Review cleanup کلیک کنید.',
          'فهرست را ببینید. تیک image ای را که هنوز می‌خواهید بردارید، مثلاً app:1.2.0.',
          'Delete selected را بزنید و تأیید را بخوانید که دستور docker image rm را فهرست می‌کند.',
          'تأیید کنید. یک toast می‌گوید "Space freed - 4 images removed - about 1.8 GB".',
        ],
      },
      tips: [
        'دکمه Remove روی یک ردیف اجباری عمل می‌کند؛ پنجره Free space راه امن‌تر برای حذف چند image است.',
        'یک tag که دوباره build شود image قدیمی را به‌صورت dangling باقی می‌گذارد. Prune dangling راه سریع پاک کردن آن‌هاست.',
        'راز و رمز را داخل خط‌های ARG یا ENV در Dockerfile نگذارید؛ در History دیده می‌شوند.',
        'latest فقط یک نام است که می‌تواند تغییر کند. یک tag نسخه یا digest را ترجیح دهید.',
      ],
    },

    'docker/compose': {
      title: 'Compose (کامپوز)',
      summary: 'پروژه‌های Docker Compose (چند container که در یک فایل compose.yaml تعریف شده‌اند) را به‌عنوان یک واحد مدیریت کنید: بالا آوردن، ری‌استارت، توقف، پایین آوردن، خواندن پیکربندی نهایی و لاگ ترکیبی.',
      whenToUse: [
        'برای شروع یا توقف یک برنامه کامل که از چند سرویس ساخته شده است.',
        'برای بررسی اینکه Compose واقعاً از YAML شما چه چیزی را نتیجه گرفته (بعد از اعمال متغیرها و override ها).',
        'برای خواندن لاگ ترکیبی همه سرویس‌های یک پروژه.',
        'برای دیدن اینکه چه پروژه‌هایی وجود دارند و آیا کاملاً در حال اجرا هستند.',
      ],
      howItWorks: [
        'OpsDeck پروژه‌هایی را که Docker Compose می‌شناسد فهرست می‌کند (docker compose ls). هر پروژه یک کارت است. اقدام‌ها دستورهای Compose را محدود به نام همان پروژه اجرا می‌کنند.',
        'فهرست هنگام باز شدن صفحه بارگذاری می‌شود؛ برای بارگذاری دوباره از Refresh استفاده کنید. بعد از پایان هر اقدام، صفحه خودکار دوباره بارگذاری می‌شود و یک toast نشان می‌دهد.',
        'Compose روی هر container ای که می‌سازد label می‌گذارد، پس همان پروژه در صفحه Containers هم گروه‌بندی‌شده دیده می‌شود.',
      ],
      parts: [
        {
          name: 'Page header (سربرگ صفحه)',
          description: 'دو دکمه به‌علاوه Ask AI.',
          items: [
            { name: 'Refresh', description: 'فهرست پروژه‌ها را دوباره بارگذاری می‌کند.' },
            { name: 'Compose docs', description: 'دوره Docker Compose را در Academy باز می‌کند.' },
            { name: 'Ask AI', description: 'وقتی Send را بزنید، درباره صفحه با فهرست پروژه‌ها به‌عنوان زمینه از هوش مصنوعی سؤال می‌کند.' },
          ],
        },
        {
          name: 'Summary strip (نوار خلاصه)',
          description: 'وقتی دست‌کم یک پروژه وجود داشته باشد نمایش داده می‌شود: Projects (تعداد)، Running services (مجموع container های در حال اجرا در همه پروژه‌ها)، Compose engine (نسخه نصب‌شده Compose) و Academy lessons (تعداد درس‌های دوره Compose).',
        },
        {
          name: 'Project card (کارت پروژه)',
          description: 'برای هر پروژه یک کارت.',
          items: [
            { name: 'Name and status badge', description: 'نام پروژه. اگر Compose آن را در حال اجرا گزارش کند نشان سبز running، وگرنه وضعیت خام به‌رنگ خاکستری، مثلاً exited(2) یا running(1), exited(1).' },
            { name: 'Config file path', description: 'اولین فایل compose که پروژه استفاده می‌کند. اگر Compose چیزی گزارش نکند "No config file" نمایش داده می‌شود. برای دیدن مسیر کامل نشانگر را روی آن نگه دارید.' },
            { name: 'Ask AI icon', description: 'درباره همین پروژه با پیکربندی، لاگ‌ها و سرویس‌های زنده‌اش از هوش مصنوعی سؤال می‌کند.' },
            { name: 'Resolved config icon', description: 'کشوی پیکربندی نهایی را باز می‌کند (در ادامه).' },
            { name: 'Logs icon', description: 'کشوی لاگ پروژه را باز می‌کند (در ادامه).' },
            { name: 'Running / Files / Status', description: 'سه عدد کوچک: container های در حال اجرا، تعداد فایل‌های compose و متن وضعیت.' },
            { name: 'Up button', description: 'دستور docker compose up -d را برای پروژه اجرا می‌کند و در صورت نیاز image ها را build می‌کند. container های ناموجود را می‌سازد و container های متوقف را شروع می‌کند.' },
            { name: 'Restart button', description: 'همه سرویس‌های پروژه را ری‌استارت می‌کند.' },
            { name: 'Stop button', description: 'سرویس‌ها را متوقف می‌کند ولی container ها را نگه می‌دارد، پس Up یا Restart می‌تواند سریع آن‌ها را برگرداند.' },
            { name: 'Down button (red)', description: 'بعد از تأیید، docker compose down را اجرا می‌کند. container ها و network پروژه حذف می‌شوند؛ volume های نام‌دار می‌مانند تا داده‌های شما از بین نرود.' },
            { name: 'Learn button', description: 'درس معماری Compose را باز می‌کند.' },
          ],
        },
        {
          name: 'Resolved config drawer (کشوی پیکربندی نهایی)',
          description: 'پیکربندی نهایی ای را که Compose استفاده می‌کند به‌صورت JSON نشان می‌دهد، با مسیر فایل در بالا و یک نشان برای نام هر سرویس. Copy متن را کپی می‌کند؛ دکمه‌های پاورقی: Ask AI، درس Compose services، Copy path و Close.',
        },
        {
          name: 'Compose logs drawer (کشوی لاگ Compose)',
          description: '۲۰۰ خط آخر لاگ همه سرویس‌ها را نشان می‌دهد، بدون کدهای رنگ. Reload دوباره آن‌ها را می‌گیرد. پاورقی دقیقاً دستور docker compose logs، یک دکمه Ask AI و Close را نشان می‌دهد.',
        },
        {
          name: 'Empty state (حالت خالی)',
          description: 'وقتی هیچ پروژه‌ای نباشد "No Compose projects found" ظاهر می‌شود. Open Compose Academy و یک Guided Compose lab را پیشنهاد می‌دهد.',
        },
        {
          name: 'Compose project names banner',
          description: 'یادآوری اینکه OpsDeck از نام پروژه برای پیدا کردن فایل پیکربندی و اجرای دستورهای محدود استفاده می‌کند و اینکه پروژه‌های sandbox مربوط به lab ها با opsdeck-lab- شروع می‌شوند.',
        },
      ],
      example: {
        title: 'مثال: ری‌استارت یک برنامه بعد از تغییر فایل پیکربندی',
        steps: [
          'Compose را باز کنید و کارت پروژه‌ای به نام shop را پیدا کنید (وضعیت running، Running 3).',
          'روی آیکون Resolved config کلیک کنید تا ببینید تغییر شما (مثلاً یک متغیر محیطی جدید) دیده می‌شود.',
          'روی Up کلیک کنید. Compose فقط سرویس‌هایی را که پیکربندی‌شان تغییر کرده دوباره می‌سازد.',
          'روی آیکون Logs کلیک کنید و Reload را بزنید تا مطمئن شوید سرویس‌ها بدون مشکل شروع شده‌اند.',
        ],
      },
      tips: [
        'Down، container ها و network ها را حذف می‌کند ولی volume های نام‌دار را نه. راه معمول بازنشانی یک محیط بدون از دست دادن داده پایگاه داده است.',
        'Up همچنین image ها را build می‌کند، پس اجرای اول ممکن است کمی طول بکشد.',
        'فقط پروژه‌هایی که Compose می‌بیند نمایش داده می‌شوند. پروژه‌ای که پوشه‌اش حذف شده ممکن است وضعیت داشته باشد ولی فایل پیکربندی نه.',
        'اگر یک اقدام شکست بخورد، toast قرمز خطایی را که Compose چاپ کرده نشان می‌دهد.',
      ],
    },

    'docker/volumes': {
      title: 'Volumes (ولوم‌ها)',
      summary: 'فضای ذخیره‌سازی نام‌دار که Docker مدیریت می‌کند. volume ها داده‌ها (پایگاه داده، فایل‌های آپلودشده) را بعد از حذف container نگه می‌دارند.',
      whenToUse: [
        'برای دیدن اینکه چه volume های نام‌داری وجود دارند و کدام پروژه Compose آن‌ها را ساخته است.',
        'برای ساخت یک volume قبل از شروع یک container.',
        'برای بررسی یک volume (کجای دیسک قرار دارد، driver و label هایش).',
        'برای حذف volume هایی که دیگر لازم ندارید.',
      ],
      howItWorks: [
        'فهرست هنگام باز شدن صفحه از Docker خوانده می‌شود. برای بارگذاری دوباره از Refresh استفاده کنید.',
        'volume روی همین دستگاه قرار دارد. بعد از docker rm یک container باقی می‌ماند، ولی نسخه پشتیبان نیست: اگر دیسک خراب شود یا volume را حذف کنید، داده از بین می‌رود.',
        'volume های نمایش‌داده‌شده در اینجا volume های نام‌دار تحت مدیریت Docker هستند، نه bind mount های host (پوشه‌هایی که از سیستم‌فایل خودتان نگاشت می‌کنید).',
      ],
      parts: [
        {
          name: 'Header buttons (دکمه‌های سربرگ)',
          description: 'سه اقدام به‌علاوه Ask AI.',
          items: [
            { name: 'Create volume', description: 'یک نام می‌پرسد (حروف، رقم، زیرخط، نقطه یا خط تیره، شروع با حرف یا رقم، حداکثر 128 نویسه، مثلاً app-data) و docker volume create را اجرا می‌کند.' },
            { name: 'Prune unused', description: 'بعد از تأیید قرمز، docker volume prune --force را اجرا می‌کند. هر volume ای که هیچ container ای به آن ارجاع ندهد حذف می‌شود و داده‌اش از بین می‌رود.' },
            { name: 'Refresh', description: 'فهرست را دوباره بارگذاری می‌کند.' },
          ],
        },
        {
          name: 'Summary strip (نوار خلاصه)',
          description: 'Volumes (کل)، Drivers (driver های متمایز)، Compose-managed (volume هایی که label Compose دارند) و Storage lesson (تعداد درس‌های دوره volume ها).',
        },
        {
          name: 'Row actions (اقدام‌های ردیف)',
          description: 'دکمه‌های هر ردیف.',
          items: [
            { name: 'Inspect (eye)', description: 'کشویی با JSON کامل docker volume inspect باز می‌کند (mountpoint، driver، label ها، گزینه‌ها). پاورقی: Ask AI، Storage lesson، Copy command، Close.' },
            { name: 'Ask AI', description: 'درباره volume و container هایی که از آن استفاده می‌کنند از هوش مصنوعی سؤال می‌کند.' },
            { name: 'Remove (red trash)', description: 'بعد از تأیید، volume و همه داده‌های داخل آن را برای همیشه حذف می‌کند.' },
          ],
        },
        {
          name: 'Empty state (حالت خالی)',
          description: '"No volumes" همراه با دکمه Create volume. volume ها وقتی ظاهر می‌شوند که یک container یا پروژه Compose آن‌ها را بسازد.',
        },
        {
          name: 'Volumes are not backups banner',
          description: 'یادآوری زرد برای پشتیبان‌گیری صریح از داده‌ها و نوشتن مراحل بازیابی، همراه با لینک Storage lesson.',
        },
      ],
      tables: [
        {
          name: 'Volumes table',
          columns: [
            { name: 'Volume', meaning: 'نام volume با فونت درشت و scope آن در زیرش.', example: 'shop_db-data / local scope' },
            { name: 'Driver', meaning: 'storage driver. local حالت عادی است.', example: 'local' },
            { name: 'Created', meaning: 'مدتی که از ساخت volume گذشته است.', example: '2 weeks ago' },
            { name: 'Labels', meaning: 'حداکثر دو label به‌صورت نشان‌های key=value. Compose label های پروژه و volume را اضافه می‌کند.', example: 'com.docker.compose.project=shop' },
            { name: 'Actions (unlabeled)', meaning: 'Inspect، Ask AI، Remove.', example: '' },
          ],
        },
      ],
      example: {
        title: 'مثال: ساخت یک volume و بررسی آن',
        steps: [
          'روی Create volume کلیک کنید و pgdata را تایپ کنید، بعد Create. یک toast عبارت "docker volume create pgdata" را نشان می‌دهد.',
          'pgdata را در جدول پیدا کنید و روی Inspect کلیک کنید تا mountpoint آن را زیر /var/lib/docker/volumes ببینید.',
          'volume را در یک container استفاده کنید، مثلاً با صفحه Terminal: docker run -d -v pgdata:/var/lib/postgresql/data postgres:16.',
        ],
      },
      tips: [
        'Prune unused هر volume ای را که هیچ container ای به آن ارجاع نمی‌دهد حذف می‌کند، از جمله volume های container های متوقفی که ممکن است دوباره بخواهید. اول فهرست را بررسی کنید.',
        'این صفحه اندازه volume یا اینکه کدام container از آن استفاده می‌کند را نشان نمی‌دهد؛ صفحه Docker Intelligence و Ask AI می‌توانند در این مورد کمک کنند.',
        'برای volume ها نام روشن بگذارید. Compose آن‌ها را به شکل project_volume نام‌گذاری می‌کند، مثلاً shop_db-data.',
      ],
    },

    'docker/networks': {
      title: 'Networks (شبکه‌ها)',
      summary: 'شبکه‌های مجازی که container های شما را به هم وصل می‌کنند. آن‌ها را بسازید، بررسی کنید و حذف کنید و ببینید کدام container ها به آن‌ها وصل‌اند.',
      whenToUse: [
        'برای ساخت یک شبکه خصوصی تا container ها بتوانند با نام یکدیگر را پیدا کنند.',
        'برای دیدن subnet، gateway و container های متصل به یک network.',
        'برای حذف network هایی که دیگر استفاده نمی‌شوند.',
      ],
      howItWorks: [
        'فهرست هنگام باز شدن صفحه از Docker خوانده می‌شود؛ برای بارگذاری دوباره از Refresh استفاده کنید.',
        'Docker همیشه سه network داخلی دارد: bridge (پیش‌فرض)، host و none. network هایی که خودتان می‌سازید (user-defined bridge) به container ها تشخیص خودکار نام می‌دهند: container ای به نام db برای بقیه روی همان network با نام db در دسترس است. container های روی bridge پیش‌فرض این قابلیت را ندارند.',
        'Compose برای هر پروژه خودکار یک network از نوع user-defined می‌سازد، معمولاً با نام project_default.',
      ],
      parts: [
        {
          name: 'Header buttons (دکمه‌های سربرگ)',
          description: 'سه اقدام به‌علاوه Ask AI.',
          items: [
            { name: 'Create network', description: 'یک فرم باز می‌کند (در ادامه).' },
            { name: 'Prune unused', description: 'بعد از تأیید، docker network prune --force را اجرا می‌کند. network هایی که هیچ container ای از آن‌ها استفاده نمی‌کند حذف می‌شوند؛ network های داخلی می‌مانند.' },
            { name: 'Refresh', description: 'فهرست را دوباره بارگذاری می‌کند.' },
          ],
        },
        {
          name: 'Summary strip (نوار خلاصه)',
          description: 'Networks (کل)، User-defined bridge (network های bridge که bridge، host یا none نیستند)، Overlay (network های swarm چندمیزبانه) و Internal only (network هایی بدون دسترسی به بیرون).',
        },
        {
          name: 'Create network dialog (پنجره ساخت network)',
          description: 'یک فرم کوچک.',
          items: [
            { name: 'Network name', description: 'الزامی. مثال: app-net.' },
            { name: 'Driver', description: 'bridge (پیش‌فرض، تک‌میزبان)، overlay (swarm، چند میزبان) یا macvlan (به container ها آدرس روی شبکه فیزیکی شما می‌دهد).' },
            { name: 'Subnet (optional)', description: 'بازه آدرس مثل 172.28.0.0/16. خالی بگذارید تا Docker انتخاب کند.' },
            { name: 'Internal network checkbox', description: 'container های روی آن می‌توانند با هم صحبت کنند ولی با دنیای بیرون نه.' },
          ],
        },
        {
          name: 'Row actions (اقدام‌های ردیف)',
          description: 'دکمه‌های هر ردیف.',
          items: [
            { name: 'Inspect (eye)', description: 'کشویی با مقدارهای Driver، Scope، Subnet، Gateway، Internal و IPv6 به‌علاوه فهرست Attached containers باز می‌کند که نام و آدرس IPv4 هر container را نشان می‌دهد. پاورقی: Ask AI، DNS lesson، Copy command، Close.' },
            { name: 'Ask AI', description: 'درباره network و container های متصل به آن از هوش مصنوعی سؤال می‌کند.' },
            { name: 'Remove (red trash)', description: 'بعد از تأیید network را حذف می‌کند. اول باید container ها جدا یا حذف شوند.' },
          ],
        },
        {
          name: 'Empty state and banner (حالت خالی و بنر)',
          description: '"No networks" ساخت یک user-defined bridge را پیشنهاد می‌دهد. یک بنر توضیح می‌دهد که تشخیص نام به network از نوع user-defined نیاز دارد و به درس شبکه لینک می‌دهد.',
        },
      ],
      tables: [
        {
          name: 'Networks table',
          columns: [
            { name: 'Network', meaning: 'نام network با فونت درشت و ID کوتاهش در زیر.', example: 'shop_default / 7c1e9f2a4b3d' },
            { name: 'Driver', meaning: 'نشان: bridge (آبی)، overlay (بنفش) یا سایر (فیروزه‌ای).', example: 'bridge' },
            { name: 'Scope', meaning: 'local (همین میزبان) یا swarm (خوشه).', example: 'local' },
            { name: 'Internal', meaning: 'وقتی network دسترسی به بیرون ندارد نشان کهربایی "internal"؛ در غیر این صورت خط تیره.', example: 'internal' },
            { name: 'IPv6', meaning: 'وقتی IPv6 فعال است نشان فیروزه‌ای IPv6.', example: 'IPv6' },
            { name: 'Created', meaning: 'مدتی که از ساخت آن گذشته است.', example: '3 days ago' },
            { name: 'Actions (unlabeled)', meaning: 'Inspect، Ask AI، Remove.', example: '' },
          ],
        },
      ],
      example: {
        title: 'مثال: برقراری ارتباط دو container با نام',
        steps: [
          'روی Create network کلیک کنید، نام آن را app-net بگذارید، driver را bridge نگه دارید و Create network را بزنید.',
          'container های خود را روی آن شروع کنید، مثلاً از Terminal: docker run -d --network app-net --name db postgres:16 و docker run -d --network app-net --name web my-web.',
          'روی app-net گزینه Inspect را باز کنید. زیر Attached containers باید db و web را با IP هایشان ببینید.',
          'داخل web حالا پایگاه داده با نام میزبان db در دسترس است.',
        ],
      },
      tips: [
        'network های داخلی (bridge، host، none) قابل حذف نیستند.',
        'یک network از نوع internal همه ترافیک خروجی را مسدود می‌کند، پس container های روی آن نمی‌توانند بسته دانلود کنند.',
        'تا وقتی container ها هنوز وصل‌اند Remove شکست می‌خورد؛ ابتدا آن‌ها را متوقف یا جدا کنید.',
      ],
    },

    'docker/builds': {
      title: 'Builds (ساخت image)',
      summary: 'builder های Buildx شما (موتورهایی که image می‌سازند)، platform هایی که پشتیبانی می‌کنند و کش build را نشان می‌دهد و به شما اجازه می‌دهد از یک Dockerfile image بسازید.',
      whenToUse: [
        'برای ساخت یک image از Dockerfile در پوشه یک پروژه.',
        'برای بررسی اینکه چه builder هایی وجود دارند و برای کدام platform های CPU می‌توانند build کنند (مثلاً linux/amd64 و linux/arm64).',
        'برای دیدن اینکه کش build چقدر فضا مصرف می‌کند.',
      ],
      howItWorks: [
        'Docker با BuildKit، image می‌سازد. builder یک نمونه BuildKit است. builder پیش‌فرض از خود موتور Docker استفاده می‌کند؛ با docker buildx create می‌توانید builder های دیگر بسازید.',
        'صفحه هنگام باز شدن builder ها و مصرف کش را بارگذاری می‌کند؛ برای بارگذاری دوباره Refresh را بزنید.',
        'ساخت، docker build را به‌عنوان یک دستور اجرا می‌کند. اولین باری که از آن استفاده می‌کنید، OpsDeck همان رضایت ترمینال صفحه Terminal را می‌پرسد.',
      ],
      parts: [
        {
          name: 'Header buttons (دکمه‌های سربرگ)',
          description: 'Build an image و Refresh، به‌علاوه Ask AI.',
          items: [
            { name: 'Build an image', description: 'پنجره build را باز می‌کند (در ادامه). اگر هنوز رضایت نداده باشید اول رضایت ترمینال را می‌پرسد.' },
            { name: 'Refresh', description: 'builder ها و کش را دوباره بارگذاری می‌کند.' },
          ],
        },
        {
          name: 'Builder card (کارت builder)',
          description: 'برای هر builder Buildx یک کارت.',
          items: [
            { name: 'Name and current badge', description: 'نام builder. نشان سبز "current" مشخص می‌کند کدام builder به‌صورت پیش‌فرض استفاده می‌شود.' },
            { name: 'Driver badge', description: 'نحوه اجرای builder، مثلاً docker یا docker-container.' },
            { name: 'dynamic / static badge', description: 'builder های dynamic گره‌های خود را در صورت نیاز می‌سازند؛ builder های static گره‌های ثابت دارند.' },
            { name: 'Nodes badge', description: 'تعداد گره‌ها، مثلاً "1 nodes".' },
            { name: 'Active badge', description: 'آخرین زمان استفاده از builder، مثلاً "active 2 days ago".' },
            { name: 'Nodes list', description: 'نام هر گره با نشان وضعیت (در حال اجرا سبز است) و قرص‌هایی برای platform هایی که می‌تواند بسازد، مثل linux/amd64.' },
          ],
        },
        {
          name: 'Build cache card (کارت کش build)',
          description: 'یک نوار و اندازه کل کش BuildKit، با اندازه قابل بازیابی در زیرعنوان و یادداشتی مثل "42 cache records". توصیه می‌کند وقتی daemon بیکار است با docker builder prune پاک‌سازی کنید. اگر BuildKit چیزی گزارش ندهد "No cache data" نمایش داده می‌شود.',
        },
        {
          name: 'Reproducible build recipe card',
          description: 'یک کارت آموزشی. یک دستور نمونه نشان می‌دهد (docker buildx build --platform linux/amd64,linux/arm64 -t registry.example.com/app:1.4.0 --push .) و چهار نکته: image های پایه را pin کنید، مرحله build و runtime را جدا کنید، در CI از --cache-from / --cache-to استفاده کنید و گواهی‌های SBOM و provenance را پیوست کنید. یک دکمه درس BuildKit را باز می‌کند.',
        },
        {
          name: 'Build an image dialog (پنجره ساخت image)',
          description: 'فرمی با پیش‌نمایش زنده دستور. زدن Run build تأیید می‌گیرد (build ها CPU و دیسک مصرف می‌کنند و ممکن است چند دقیقه طول بکشند) و بعد دستور را اجرا می‌کند. toast ها شروع، موفقیت یا شکست را گزارش می‌دهند.',
          items: [
            { name: 'Image tag', description: 'نام الزامی برای نتیجه. با opsdeck/app:dev پر شده است.' },
            { name: 'Dockerfile', description: 'مسیر اختیاری Dockerfile (-f). خالی یعنی فایلی به نام Dockerfile در context.' },
            { name: 'Platform', description: 'هدف اختیاری مثل linux/amd64 (--platform).' },
            { name: 'Build context (absolute path)', description: 'پوشه‌ای که به builder فرستاده می‌شود، مثلاً /home/you/project. خالی یعنی ".".' },
            { name: 'Disable cache checkbox', description: '--no-cache را اضافه می‌کند تا همه مراحل دوباره ساخته شوند.' },
          ],
        },
        {
          name: 'Empty state (حالت خالی)',
          description: '"No buildx builders" همراه با دکمه Open build academy وقتی هیچ builder ای پیدا نشود.',
        },
      ],
      example: {
        title: 'مثال: ساخت یک image محلی',
        steps: [
          'روی Build an image کلیک کنید. اگر پیام رضایت ظاهر شد آن را بپذیرید.',
          'Image tag را myapp:dev و Build context را /home/you/myapp بگذارید. پیش‌نمایش این‌طور می‌شود: docker build -t myapp:dev /home/you/myapp.',
          'Run build را بزنید و تأیید کنید. منتظر toast با عبارت "Build completed" بمانید.',
          'Images را باز کنید؛ myapp:dev در فهرست است و با دکمه Run می‌توان آن را اجرا کرد.',
        ],
      },
      tips: [
        'خروجی build در این صفحه به‌صورت زنده نمایش داده نمی‌شود. اگر build شکست بخورد، toast ابتدای خطا را نشان می‌دهد؛ همان docker build را در صفحه Terminal اجرا کنید تا جزئیات بیشتری ببینید.',
        'در Dockerfile خود از یک tag مشخص برای image پایه استفاده کنید، نه فقط latest، تا build ها تکرارپذیر باشند.',
        'کش build با گذشت زمان می‌تواند بزرگ شود؛ در کارت دیسک Overview جزو فضای قابل بازیابی است.',
      ],
    },

    'docker/registries': {
      title: 'Registries (رجیستری‌ها)',
      summary: 'نشان می‌دهد در کدام registry ها وارد شده‌اید، image های محلی شما از کجا آمده‌اند و به شما اجازه می‌دهد در Docker Hub جستجو کنید.',
      whenToUse: [
        'برای بررسی اینکه Docker برای کدام registry ها اعتبارنامه دارد.',
        'برای دیدن اینکه چند تا از image های شما از هر registry آمده است.',
        'برای پیدا کردن یک image عمومی در Docker Hub و کپی یا اجرای دستور docker pull آن.',
      ],
      howItWorks: [
        'OpsDeck فایل پیکربندی Docker شما را می‌خواند تا registry هایی را که در آن‌ها وارد شده‌اید فهرست کند. هرگز رمز عبور نمی‌خواهد، نشان نمی‌دهد و ذخیره نمی‌کند؛ اعتبارنامه‌ها در پیکربندی Docker یا credential store شما می‌مانند.',
        'برای ورود به یک registry خودتان در یک ترمینال docker login را اجرا کنید.',
        'جستجوی Docker Hub وقتی فرم را ارسال می‌کنید عبارت جستجوی شما را به Docker Hub می‌فرستد. هیچ چیز دیگری ارسال نمی‌شود.',
      ],
      parts: [
        {
          name: 'Header (سربرگ)',
          description: 'Refresh داده‌ها را دوباره بارگذاری می‌کند. Registry lesson درس احراز هویت registry را باز می‌کند. Ask AI مثل صفحه‌های دیگر کار می‌کند.',
        },
        {
          name: 'Authenticated registries card',
          description: 'هر میزبان registry ای را که در آن وارد شده‌اید با یک آیکون کلید سبز و نشانی که نام کاربری ذخیره‌شده (یا "token") را نشان می‌دهد فهرست می‌کند. زیرعنوان می‌گوید از کدام credential store استفاده می‌شود، مثلاً "Credential store: desktop". پاورقی مسیر فایل پیکربندی Docker را نشان می‌دهد.',
          items: [
            { name: 'Empty state', description: '"No registry logins" توضیح می‌دهد که باید در یک ترمینال docker login را اجرا کنید.' },
          ],
        },
        {
          name: 'Image sources card',
          description: 'برای هر میزبان registry در میان image های محلی شما یک عدد و یک نوار، مثلاً docker.io 14، ghcr.io 3. وقتی image ای ندارید "No images yet" ظاهر می‌شود.',
        },
        {
          name: 'Docker Hub search card',
          description: 'یک کادر جستجو و دکمه Search. نامی مثل postgres را تایپ کنید و Enter یا Search را بزنید. ناحیه نتیجه یک پیام در حال بارگذاری، یک بنر خطا اگر جستجو شکست خورده باشد، یا جدول نتایج را نشان می‌دهد. قبل از هر جستجو "Search public images" نوشته شده است.',
          items: [
            { name: 'Copy pull command (copy icon)', description: 'docker pull NAME را در کلیپ‌بورد کپی می‌کند.' },
            { name: 'Run in terminal (play icon)', description: 'صفحه Terminal را با docker pull NAME پر می‌کند تا بررسی و اجرایش کنید.' },
          ],
        },
        {
          name: 'Verify before you pull banner',
          description: 'یادآوری اینکه image های رسمی را خود Docker نگه‌داری می‌کند، Docker Hub ناشران تأییدشده را علامت می‌زند و در محیط production باید digest را pin کرد.',
        },
      ],
      tables: [
        {
          name: 'Search results table',
          columns: [
            { name: 'Repository', meaning: 'نام image در Docker Hub.', example: 'postgres' },
            { name: 'Description', meaning: 'توضیح کوتاه از ناشر، یا "No description".', example: 'The PostgreSQL object-relational database system' },
            { name: 'Stars', meaning: 'تعداد کاربرانی که آن را ستاره داده‌اند؛ نشانه تقریبی محبوبیت.', example: '13,000' },
            { name: 'Trust', meaning: 'official (سبز) برای image های رسمی Docker، automated (فیروزه‌ای) برای build های خودکار و community (خاکستری) برای بقیه.', example: 'official' },
            { name: 'Actions (unlabeled)', meaning: 'Copy pull command و Run in terminal.', example: '' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن و pull کردن یک image پایگاه داده',
        steps: [
          'در کادر جستجوی Docker Hub عبارت redis را تایپ کنید و Enter بزنید.',
          'به ستون Trust نگاه کنید. ردیفی را که official است انتخاب کنید.',
          'روی آیکون play (Run in terminal) کلیک کنید. صفحه Terminal با docker pull redis پر‌شده باز می‌شود.',
          'آن را به یک نسخه pin‌شده ویرایش کنید، مثلاً docker pull redis:7.4، و Run را بزنید.',
        ],
      },
      tips: [
        'image های community را هر کسی می‌تواند منتشر کند. قبل از pull ناشر و توضیح را بررسی کنید.',
        'tag ای مثل latest می‌تواند در طول زمان تغییر کند. در production یک نسخه یا digest را pin کنید.',
        'از این صفحه فقط Docker Hub قابل جستجو است. registry های خصوصی در فهرست واردشده‌ها دیده می‌شوند ولی جستجو نمی‌شوند.',
      ],
    },

    'docker/monitoring': {
      title: 'Monitoring (پایش)',
      summary: 'عددهای زنده CPU، حافظه، شبکه، دیسک و فرایندها برای هر container در حال اجرا، که هر ۴ ثانیه تازه می‌شود.',
      whenToUse: [
        'برای پیدا کردن اینکه کدام container بیشترین CPU یا حافظه را مصرف می‌کند.',
        'برای تماشای مصرف منابع هنگام اجرای تست بار یا build.',
        'برای بررسی اینکه آیا یک container به محدودیت حافظه‌اش نزدیک است.',
      ],
      howItWorks: [
        'عددها از docker stats می‌آیند. صفحه هنگام باز شدن و بعد هر ۴ ثانیه تا وقتی باز است آن‌ها را می‌خواند؛ نشان Live سبز این را تأیید می‌کند. Refresh now آن‌ها را بلافاصله می‌خواند.',
        'هر نمونه به تاریخچه ای که دو نمودار استفاده می‌کنند هم اضافه می‌شود و تقریباً یک دقیقه اخیر را نشان می‌دهند. تاریخچه تا وقتی OpsDeck باز است نگه داشته می‌شود و با صفحه Overview مشترک است.',
        'فقط container های در حال اجرا فهرست می‌شوند. container های متوقف عدد زنده ندارند.',
      ],
      parts: [
        {
          name: 'Header (سربرگ)',
          description: 'دکمه Refresh now، نشان سبز "Live - 4s" و دکمه Ask AI (که شامل اطلاعات زنده است).',
        },
        {
          name: 'Four stat cards (چهار کارت آماری)',
          description: 'مجموع‌ها برای همه container های در حال اجرا.',
          items: [
            { name: 'Aggregate CPU', description: 'مجموع درصدهای CPU همراه با تعداد container های در حال اجرا.' },
            { name: 'Memory', description: 'کل حافظه مصرفی و سهم آن از حافظه دستگاه شما، مثلاً "2.1 GB, 13.0% of 16 GB".' },
            { name: 'Highest CPU', description: 'بزرگ‌ترین درصد CPU و نام آن container. وقتی چیزی اجرا نمی‌شود خط تیره همراه با "no samples" نشان می‌دهد.' },
            { name: 'Processes', description: 'تعداد کل فرایندها (PID ها) داخل همه container ها.' },
          ],
        },
        {
          name: 'CPU pressure and Memory pressure charts',
          description: 'نمودارهای سطحی CPU تجمیعی و حافظه به‌صورت درصدی از host، از "60s" تا "now". برای دیدن مقدارها نشانگر را روی آن‌ها ببرید. با هر نمونه به‌روز می‌شوند.',
        },
        {
          name: 'Per-container telemetry table',
          description: 'جدول جزئیات. برچسب "sampled HH:MM:SS" بالای آن نشان می‌دهد آخرین نمونه کی گرفته شده است. هر ردیف با یک دکمه Ask AI (همراه با اطلاعات زنده) و در صورت وجود یک لینک درس تمام می‌شود.',
        },
        {
          name: 'Learn to read the numbers banner',
          description: 'توضیح می‌دهد که CPU در استفاده چندهسته‌ای می‌تواند از 100% بیشتر شود و اینکه محدودیت حافظه یک سقف است، نه حافظه در حال استفاده. به درس resource limits لینک می‌دهد.',
        },
      ],
      tables: [
        {
          name: 'Per-container telemetry',
          columns: [
            { name: 'Container', meaning: 'نام با ID کوتاه زیر آن و یک نقطه سبز running.', example: 'api-1 / 3f2a9c7b1d4e' },
            { name: 'CPU', meaning: 'نوار و درصد. تا 50% سبز، بالای 50% کهربایی، بالای 80% قرمز.', example: '63.2% (amber)' },
            { name: 'Memory', meaning: 'نوار با مصرف / محدودیت. بالای 80% محدودیت قرمز می‌شود. اگر محدودیتی تنظیم نشده باشد، محدودیت همان حافظه host است.', example: '210MiB / 512MiB' },
            { name: 'Network', meaning: 'کل داده دریافتی (فلش پایین) و ارسالی (فلش بالا) از زمان شروع container.', example: '1.2 GB down / 340 MB up' },
            { name: 'Block I/O', meaning: 'کل داده‌ای که container از دیسک خوانده و روی آن نوشته است.', example: '12 MB / 98 MB' },
            { name: 'PIDs', meaning: 'تعداد فرایندها و نخ‌های در حال اجرا در container.', example: '14' },
            { name: 'Actions (unlabeled)', meaning: 'Ask AI و لینک درس.', example: '' },
          ],
        },
      ],
      example: {
        title: 'مثال: پیدا کردن container ای که دستگاه شما را کند می‌کند',
        steps: [
          'Monitoring را باز کنید. به کارت Highest CPU نگاه کنید، مثلاً "148.0% - worker-1".',
          'worker-1 را در جدول پیدا کنید. نوار CPU قرمز است.',
          'روی آیکون Ask AI آن کلیک کنید تا توضیحی بر پایه داده‌های زنده بگیرید، یا به Containers بروید و Logs آن را باز کنید.',
          'آن را ری‌استارت یا درست کنید و کاهش نمودار CPU pressure را تماشا کنید.',
        ],
      },
      tips: [
        'Network و Block I/O مجموع از زمان شروع container هستند، نه نرخ در ثانیه.',
        'container ای که محدودیت حافظه ندارد کل حافظه host را به‌عنوان سقف خود نشان می‌دهد.',
        'صفحه را باز بگذارید تا نمودار پر شود؛ ترک صفحه، تازه‌سازی ۴ ثانیه‌ای را متوقف می‌کند.',
      ],
    },

    'docker/events': {
      title: 'Events (رویدادها)',
      summary: 'یک خط زمانی از کارهایی که موتور Docker انجام داده: container های ساخته‌شده، شروع‌شده و متوقف‌شده، image های pull‌شده، network ها و volume های ساخته‌شده. از آن برای تطبیق دادن یک مشکل با عملی که باعث آن شده استفاده کنید.',
      whenToUse: [
        'برای فهمیدن اینکه یک container کی مرده یا ری‌استارت شده است.',
        'برای دیدن دقیق آنچه در ۵ دقیقه، یک ساعت، یک روز یا یک هفته اخیر بر موتور گذشته است.',
        'برای بررسی اینکه آیا یک دستور Compose اشیایی را که انتظار داشتید ساخته یا حذف کرده است.',
      ],
      howItWorks: [
        'صفحه هنگام باز شدن تاریخچه موتور را برای بازه انتخاب‌شده می‌خواند. به‌صورت زنده جریان نمی‌یابد؛ برای خواندن دوباره Refresh را بزنید. تغییر چیپ نوع یا بازه آن را دوباره بارگذاری می‌کند.',
        'رویدادها تغییرات را توصیف می‌کنند (create، start، die، destroy، pull، connect). لاگ نیستند: متنی که یک container چاپ می‌کند در Logs آن container است.',
        'بازه به آنچه موتور به یاد دارد محدود است، پس بازه ۷ روزه ممکن است کمتر از ۷ روز را نشان دهد.',
      ],
      parts: [
        {
          name: 'Header (سربرگ)',
          description: 'دکمه Refresh و Ask AI (با رویدادها به‌عنوان زمینه).',
        },
        {
          name: 'Type chips (چیپ‌های نوع)',
          description: 'All، به‌علاوه یک چیپ برای هر نوعی که در رویدادهای بارگذاری‌شده وجود دارد، مثل Container، Image، Network، Volume. روی یک چیپ کلیک کنید تا فقط همان نوع نمایش داده شود.',
        },
        {
          name: 'Window selector (انتخابگر بازه)',
          description: 'تا چه مدت به عقب نگاه شود: 5 minutes، 1 hour (پیش‌فرض)، 24 hours یا 7 days.',
        },
        {
          name: 'Empty state (حالت خالی)',
          description: '"No events in this window" یعنی چیزی رخ نداده؛ بازه را بزرگ‌تر کنید یا یک عملیات Docker انجام دهید.',
        },
        {
          name: 'Events are not logs banner',
          description: 'تفاوت را توضیح می‌دهد و به درس Logs and debugging لینک می‌دهد.',
        },
      ],
      tables: [
        {
          name: 'Events table',
          columns: [
            { name: 'Time', meaning: 'ساعت رویداد (۲۴ ساعته).', example: '14:32:08' },
            { name: 'Type', meaning: 'نوع شیء، به‌صورت نشان رنگی: container (آبی)، image (بنفش)، network (فیروزه‌ای)، بقیه (نارنجی).', example: 'container' },
            { name: 'Action', meaning: 'آنچه رخ داده است.', example: 'start, die, create, destroy, pull, connect' },
            { name: 'Actor', meaning: 'نام شیء (یا image یا ID کوتاه آن) با ID کامل در زیرش.', example: 'web-1 / 3f2a9c7b1d4e8a90' },
            { name: 'Attributes', meaning: 'حداکثر سه جزئیات اضافه به‌صورت نشان‌های key=value، مثل کد خروج یا networkی که container به آن پیوسته است.', example: 'exitCode=137' },
            { name: 'When', meaning: 'مدتی که از وقوع رویداد گذشته است.', example: '4 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'مثال: چرا container من متوقف شد؟',
        steps: [
          'Events را باز کنید و بازه 1 hour و چیپ Container را انتخاب کنید.',
          'ردیف api-1 را با Action برابر die و Attributes برابر exitCode=137 پیدا کنید.',
          'کد خروج 137 یعنی فرایند کشته شده، اغلب چون حافظه‌اش تمام شده. به ردیف درست قبل از آن نگاه کنید تا start را ببینید.',
          'Monitoring یا Logs مربوط به container را باز کنید تا علت را تأیید کنید.',
        ],
      },
      tips: [
        'عمل die با exitCode=0 یک پایان عادی است؛ هر عدد دیگری یعنی خطا.',
        'رویدادهای pull، create و destroy برای تأیید اینکه Compose up یا down واقعاً کار مورد انتظار را کرده مفیدند.',
      ],
    },

    'docker/terminal': {
      title: 'Terminal (ترمینال)',
      summary: 'یک کنسول فرمان امن مخصوص Docker. شما دستورهای docker را تایپ می‌کنید، OpsDeck آن‌ها را بررسی می‌کند و روی موتور محلی شما اجرا می‌کند. یک shell معمولی نیست.',
      whenToUse: [
        'برای اجرای دستور docker ای که دکمه ندارد، مثلاً docker system df یا docker volume ls.',
        'برای اجرای دستوری که یک درس، دستیار هوش مصنوعی یا صفحه Registries پیشنهاد داده است.',
        'برای دیدن خروجی دقیق و کد خروج یک دستور Docker.',
      ],
      howItWorks: [
        'هر دستور به کلمه‌ها تقسیم می‌شود و مستقیماً به‌صورت فهرست آرگومان‌ها به برنامه Docker داده می‌شود. shell ای در کار نیست، پس pipe (|)، redirect (>)، زنجیره کردن دستورها (; و &&)، متغیرها و command substitution کار نمی‌کنند و رد می‌شوند.',
        'یک اعتبارسنج همچنین گزینه‌های خطرناک مثل حالت privileged، شبکه host، namespace های host، mount کردن Docker socket و افزودن capability را مسدود می‌کند. دستور مسدودشده عبارت "Blocked by the command validator" را با دلیل و یک toast هشدار نشان می‌دهد.',
        'قبل از اولین دستور باید رضایت بدهید. بعد از پذیرفتن، به خاطر سپرده می‌شود و دوباره پرسیده نمی‌شود.',
        'صفحه تا وقتی OpsDeck باز است ۶۰ دستور آخر را نگه می‌دارد. با دکمه Clear پاک می‌شوند.',
        'صفحه‌های دیگر می‌توانند دستوری را به اینجا بفرستند (مثلاً Run in terminal در Registries)؛ دستور در ورودی پر‌شده ظاهر می‌شود تا بررسی و اجرایش کنید.',
      ],
      parts: [
        {
          name: 'Header (سربرگ)',
          description: 'دکمه Clear، یک نشان رضایت و Ask AI.',
          items: [
            { name: 'Clear', description: 'خروجی و فهرست تاریخچه را خالی می‌کند.' },
            { name: 'Consent badge', description: 'تا وقتی نپذیرید "Consent required" کهربایی، بعد از آن "Consent granted" سبز.' },
          ],
        },
        {
          name: 'Explicit consent banner (بنر رضایت صریح)',
          description: 'فقط وقتی رضایت داده نشده نمایش داده می‌شود. توضیح می‌دهد دستورها روی موتور محلی شما اثر می‌گذارند و اعتبارسنجی می‌شوند. دکمه Review consent تأییدی باز می‌کند که قوانین ایمنی را فهرست می‌کند (بدون shell، بدون حالت privileged، بدون شبکه host، بدون mount کردن Docker socket، بدون افزودن capability). برای فعال کردن I understand, continue را انتخاب کنید.',
        },
        {
          name: 'Console window (پنجره کنسول)',
          description: 'ترمینال سیاه. نوار عنوان "opsdeck - docker" و context فعال Docker را نشان می‌دهد. هر دستور به‌صورت یک بلوک ظاهر می‌شود.',
          items: [
            { name: 'Command line', description: 'دستوری که اجرا کردید، بعد از علامت $.' },
            { name: 'Exit badge', description: '"exit 0" سبز یعنی موفقیت؛ "exit 1" یا عدد دیگر یعنی شکست. اگر دستور بیش از حد طول بکشد "timed out" اضافه می‌شود.' },
            { name: 'Time', description: 'زمان اجرای دستور.' },
            { name: 'Output', description: 'خروجی استاندارد در صورت موفقیت، یا متن خطا در صورت شکست.' },
            { name: 'Running indicator', description: 'خط "Running..." وقتی یک دستور هنوز در حال اجراست. هر بار فقط یک دستور اجرا می‌شود.' },
          ],
        },
        {
          name: 'Input row (ردیف ورودی)',
          description: 'اعلان $، یک کادر متن با متن راهنمای "docker ps -a" و دکمه Run. برای اجرا Enter بزنید. فلش‌های Up و Down بین دستورهای قبلی حرکت می‌کنند. فقط دستورهای Docker پذیرفته می‌شوند.',
        },
        {
          name: 'Starters (دستورهای شروع)',
          description: 'شش چیپ که ورودی را با یک دستور امن فقط‌خواندنی پر می‌کنند: docker ps -a، docker images، docker compose ls، docker system df، docker version، docker info. روی یکی کلیک کنید، بعد Run را بزنید.',
        },
        {
          name: 'Why no shell banner',
          description: 'خطر تزریقی را که shell اضافه می‌کند توضیح می‌دهد و به درس CLI anatomy لینک می‌دهد.',
        },
      ],
      example: {
        title: 'مثال: دیدن اینکه Docker چقدر دیسک مصرف می‌کند',
        steps: [
          'روی چیپ docker system df کلیک کنید. در ورودی ظاهر می‌شود.',
          'Run را بزنید. اگر اولین بار است، پیام رضایت را بپذیرید و دوباره Run را بزنید.',
          'خروجی را بخوانید: جدولی با Images، Containers، Local Volumes و Build Cache، اندازه کل و فضای RECLAIMABLE آن‌ها.',
          'فلش Up را بزنید تا بعداً دستور را برگردانید.',
        ],
      },
      tips: [
        'تایپ ls | grep web شکست می‌خورد چون pipe مجاز نیست. به‌جای آن از فیلترها استفاده کنید، مثلاً docker ps --filter name=web.',
        'دستورهایی که تا ابد اجرا می‌شوند (docker logs -f، docker run بدون -d) با timeout تمام می‌شوند؛ به‌جای آن از -d یا کشوی Logs استفاده کنید.',
        'برای shell تعاملی داخل یک container از دکمه Open shell در صفحه Containers استفاده کنید، نه این ترمینال.',
        'شما مسئول چیزی هستید که اجرا می‌کنید: docker rm، docker image rm و docker system prune داده را حذف می‌کنند.',
      ],
    },

    'docker/academy': {
      title: 'Academy (آکادمی)',
      summary: 'یک مدرسه داخلی Docker با دوره‌ها، درس‌ها، آزمون‌ها، آزمایشگاه‌های راهنمادار، مرجع دستورها، راهنماهای عیب‌یابی، نمودارها و واژه‌نامه. پیشرفت شما فقط روی همین دستگاه ذخیره می‌شود.',
      whenToUse: [
        'وقتی با Docker تازه‌کار هستید و یک مسیر ساختاریافته از مبانی می‌خواهید.',
        'برای جستجوی اینکه یک دستور docker، flag، دستور Dockerfile یا ویژگی Compose چه می‌کند.',
        'برای تمرین امن در یک sandbox به‌جای container های خودتان.',
        'وقتی به خطایی برخورد می‌کنید و رفع مرحله‌به‌مرحله می‌خواهید.',
      ],
      howItWorks: [
        'Academy نوار تب خودش را زیر عنوان صفحه دارد: Dashboard، Courses، Paths، Reference، Troubleshooting، Labs، Visuals، Glossary و Search. همه محتوا همراه OpsDeck بسته‌بندی شده و آفلاین کار می‌کند؛ جستجو چیزی را از طریق شبکه نمی‌فرستد.',
        'پیشرفت (درس‌های کامل‌شده، نمره‌های آزمون، نشانک‌ها، یادداشت‌ها، دستاوردها، فعالیت مطالعه) به‌صورت محلی ذخیره می‌شود. می‌توانید آن را در Settings با Reset all progress پاک کنید.',
        'صفحه‌های دیگر Docker با دکمه‌ها و بنرهای Learn به Academy لینک می‌دهند، تا بتوانید درسی را که آنچه می‌بینید توضیح می‌دهد باز کنید.',
      ],
      parts: [
        {
          name: 'Dashboard tab',
          description: 'صفحه اصلی شما در Academy.',
          items: [
            { name: 'Hero and buttons', description: 'یک خوشامدگویی، جمع‌های شما (درس‌های کامل‌شده، دوره‌های کامل‌شده، میانگین آزمون، دستاوردها) و دکمه‌های Start learning یا Continue learning، Browse courses و Search everything.' },
            { name: 'Daily goal ring', description: 'یک حلقه که دقیقه‌های مطالعه امروز را در برابر هدف روزانه‌تان (در Settings تنظیم می‌شود) نشان می‌دهد، به‌علاوه رکورد پیاپی فعلی و بهترین رکورد و یک ردیف هفت‌روزه.' },
            { name: 'Continue learning card', description: 'درس تمام‌نشده بعدی با دوره، مدت و درصد پیشرفت دوره.' },
            { name: 'Your courses', description: 'حداکثر هشت دوره با سطح، درس‌های انجام‌شده و نوار پیشرفت.' },
            { name: 'Recent lessons', description: 'درس‌هایی که اخیراً باز کرده‌اید، تا از جایی که ماندید ادامه دهید.' },
            { name: 'Study activity', description: 'یک نقشه گرمایی ۲۶ هفته‌ای از درس‌های تکمیل‌شده، آزمون‌ها، بازدیدها و فعالیت lab.' },
            { name: 'Learning path card', description: 'مسیری که روی آن کار می‌کنید، با نقطه‌های مرحله و درصد پیشرفت.' },
            { name: 'Bookmarks', description: 'درس‌هایی که نشانک زده‌اید.' },
            { name: 'Quiz readiness', description: 'آزمون‌های داده‌شده، قبول‌شده (70% یا بیشتر)، نمره‌های کامل و میانگین شما.' },
            { name: 'Reference and labs card', description: 'میان‌برهایی به CLI reference، guided labs، troubleshooting و نمودارها.' },
            { name: 'Achievements strip', description: 'مدال‌هایی که می‌توانید باز کنید، مثلاً برای تعداد درس، رکورد پیاپی، آزمون یا lab. مدال‌های بازشده برجسته می‌شوند و وقتی یکی را بگیرید یک toast ظاهر می‌شود.' },
          ],
        },
        {
          name: 'Courses tab',
          description: 'عنوان "Docker Academy" با تعداد دوره‌ها و درس‌ها و دکمه Ask AI about the Academy.',
          items: [
            { name: 'Find a course box', description: 'عنوان و توضیح دوره‌ها را جستجو می‌کند.' },
            { name: 'Level chips', description: 'All، Beginner، Intermediate، Advanced، Expert.' },
            { name: 'Course card', description: 'آیکون، نشان سطح، عنوان، زیرعنوان، تعداد درس‌ها، مدت، درس‌های انجام‌شده، هشدار "Needs ..." وقتی یک دوره قبلی توصیه‌شده تمام نشده و یک نوار پیشرفت. برای باز کردن دوره کلیک کنید.' },
            { name: 'Course page', description: 'سطح، مدت، تعداد درس‌ها، پیشرفت، دکمه Start course یا Continue، دکمه Ask AI، یک نمودار donut و یک آکاردئون از ماژول‌ها را نشان می‌دهد. هر ردیف درس وقتی تمام شده علامت تیک، خلاصه‌اش، نشان درصد اگر در جریان باشد، نمره آزمونتان، آیکون هدف اگر آزمون دارد، آیکون فلاسک اگر lab دارد و مدتش را نشان می‌دهد. کارت‌های کناری، دستاوردها، اطلاعات دوره و کارهای بعدی را فهرست می‌کنند. پیش‌نیازها توصیه می‌شوند، هرگز قفل نمی‌شوند.' },
          ],
        },
        {
          name: 'Lesson page',
          description: 'از یک دوره باز می‌شود. نوار مسیر در بالا، بعد عنوان درس، خلاصه و نشان‌ها (سطح، زمان، شماره درس، Knowledge check، Guided lab، نمره آزمون) و یک نوار پیشرفت که Not started، In progress یا Completed می‌خواند.',
          items: [
            { name: 'Lesson body', description: 'متن، بلوک‌های کد با خروجی، callout ها (tip، info، warning، danger)، جدول‌ها، فهرست‌های مرحله‌ای، فهرست‌های نقطه‌ای و نمودارهای تعاملی. جعبه‌های دستور را می‌توان کپی کرد یا اگر دستور Docker باشند اجرا کرد.' },
            { name: 'Practice exercises', description: 'کارت‌هایی با یک تمرین، یک دستور، نتیجه مورد انتظار و یک راهنما.' },
            { name: 'Guided lab block', description: 'اگر درس lab داشته باشد، دکمه Open lab آن را شروع می‌کند.' },
            { name: 'Knowledge check', description: 'یک آزمون چندگزینه‌ای. پاسخ‌ها را انتخاب کنید، Submit answers را بزنید و ببینید کدام‌ها درست‌اند، همراه با توضیح. نمره قبولی نشان داده می‌شود (معمولاً 70%). Try again آن را بازنشانی می‌کند. بهترین نمره شما ذخیره می‌شود.' },
            { name: 'Your notes', description: 'یک ناحیه متن که بعد از اینکه تایپ را متوقف کنید خودکار ذخیره می‌شود. فقط محلی ذخیره می‌شود.' },
            { name: 'Previous / Next', description: 'بین درس‌های دوره جابه‌جا شوید.' },
            { name: 'Right rail', description: 'Objectives، Actions (Mark complete، Bookmark، Focus notes، Ask AI، Next lesson)، Course progress، Commands in this lesson (لینک به مرجع)، Related lessons و Sources.' },
          ],
        },
        {
          name: 'Paths tab',
          description: 'مسیرهای راهنمادار که چند دوره را به ترتیب به هم زنجیر می‌کنند. هر کارت عنوان، توضیح، نقطه‌های مرحله، دوره‌ها و درس‌های انجام‌شده، سطح، مدت و یک نوار پیشرفت را نشان می‌دهد. صفحه یک path، مرحله‌ها را به‌صورت خط زمانی با Start path یا Continue path و همچنین Outcomes، Prerequisites و Completion criteria فهرست می‌کند. یک path وقتی کامل می‌شود که همه درس‌های همه دوره‌هایش انجام شده باشد؛ تمام کردن هر path دستاورد Path Finisher را باز می‌کند.',
        },
        {
          name: 'Reference tab',
          description: 'یک مرجع دستورها با قابلیت جستجو ("Every command, flag and property").',
          items: [
            { name: 'Search box', description: 'نام‌ها، خلاصه‌ها، توضیح‌ها و برچسب‌ها را جستجو می‌کند. هر کلمه باید تطبیق کند. برای فوکوس / را بزنید.' },
            { name: 'Type chips', description: 'Docker CLI، Compose CLI، Dockerfile و YAML properties، هرکدام با تعداد ورودی‌ها.' },
            { name: 'Index', description: 'ورودی‌ها در کارت‌های گروه‌بندی‌شده، هرکدام با یک خلاصه یک‌خطی.' },
            { name: 'Entry page', description: 'Syntax، Live flag discovery (flag ها که با --help از Docker نصب‌شده شما خوانده می‌شوند، وقتی Docker در دسترس باشد)، What it does، Examples با خروجی و توضیح، Advanced usage، Expected output، Common mistakes، Security notes، Related entries، لینک درس و Previous / Next. یک فهرست سمت چپ ورودی‌های دیگر همان نوع را نشان می‌دهد و آن‌هایی را که دیده‌اید علامت می‌زند.' },
          ],
        },
        {
          name: 'Troubleshooting tab',
          description: 'راهنماهایی که بر اساس علامت مشکل سازمان‌دهی شده‌اند.',
          items: [
            { name: 'Search and category chips', description: 'یک علامت مشکل، متن خطا یا علت را جستجو کنید و بر اساس دسته فیلتر کنید.' },
            { name: 'Guide card', description: 'عنوان، دسته، نشان شدت (high یا critical قرمز، medium کهربایی، low فیروزه‌ای)، خلاصه، تعداد مراحل و درس‌ها.' },
            { name: 'Guide page', description: 'Symptoms، Likely causes، Ordered fix با دستورها (دستورهای Docker قابل اجرا هستند)، Commands used و یک ستون کناری با Matched patterns، درس‌های Explain the mechanism، Primary sources و Related guides. Copy summary عنوان و خلاصه را کپی می‌کند.' },
            { name: 'Pattern tester', description: 'یک خطا یا خط لاگ را بچسبانید؛ OpsDeck بهترین راهنمای منطبق را پیدا می‌کند. هیچ چیز از دستگاه شما خارج نمی‌شود.' },
          ],
        },
        {
          name: 'Labs tab',
          description: 'تمرین‌های عملی که دستورهای واقعی Docker را در یک sandbox اجرا می‌کنند.',
          items: [
            { name: 'Sandbox consent box', description: 'باید یک‌بار Enable sandbox را بزنید. دستورهای lab اعتبارسنجی و سخت‌سازی می‌شوند: بدون حالت privileged، بدون شبکه host، بدون host bind mount، بدون Docker socket و محدود به 0.5 CPU، 256 MB حافظه و 128 فرایند. همچنین نشان می‌دهد چند container، network و volume مربوط به lab وجود دارد، یا Docker offline.' },
            { name: 'Lab cards', description: 'تمرین‌های مستقل sandbox و lab هایی که به درس‌ها تعلق دارند. هرکدام سطح، مراحل، مدت، دوره و یک نوار پیشرفت را نشان می‌دهد.' },
            { name: 'Lab page', description: 'فهرست lab ها در سمت چپ، توضیح همراه با هدف‌ها و پیشرفت، مراحل شماره‌دار (با دکمه Load command، یا دکمه Edit file برای مراحل فایل)، یک ویرایشگر Lab workspace با تب‌های فایل، دکمه‌های Template و Save file، اطلاعات sandbox، یادداشت‌ها و یک ترمینال lab با دکمه Run. وقتی دستور شما تطبیق کند و در صورت نیاز خروجی مورد انتظار را تولید کند، یک مرحله سبز می‌شود.' },
            { name: 'Reset Lab', description: 'compose down را برای lab اجرا می‌کند، هر container، network و volume ای را که برای آن lab برچسب خورده حذف می‌کند و فایل‌هایش را پاک می‌کند. هرگز به منابع خودتان دست نمی‌زند. پیشرفت درس حفظ می‌شود.' },
          ],
        },
        {
          name: 'Visuals tab',
          description: 'نمودارهای تعاملی معماری، چرخه حیات، لایه‌ها، شبکه، Compose، ذخیره‌سازی و خط لوله build. روی یک گره کلیک کنید تا بخوانید چه می‌کند و به درس بروید. یال‌ها جریان درخواست یا داده را نشان می‌دهند، نه کابل.',
        },
        {
          name: 'Glossary tab',
          description: 'تعریف اصطلاحات Docker با کادر جستجو و چیپ‌های A تا Z. تطبیق‌ها برجسته می‌شوند.',
        },
        {
          name: 'Search tab',
          description: 'یک جستجو در میان دوره‌ها، درس‌ها، دستورها، دستورهای Dockerfile، ویژگی‌های Compose، راهنماهای عیب‌یابی، مسیرهای یادگیری، نمودارها و اصطلاحات واژه‌نامه. چیپ‌های فیلتر بر اساس نوع محدود می‌کنند، نتایج بر اساس نوع گروه‌بندی می‌شوند و تطبیق‌ها برجسته می‌شوند. چیپ‌های موضوع محبوب (docker run، exit 137، BuildKit و غیره) جستجو را برای شما پر می‌کنند.',
        },
      ],
      tables: [
        {
          name: 'Lesson row in a course',
          columns: [
            { name: 'Check circle', meaning: 'وقتی درس کامل شده باشد پر می‌شود.', example: 'checked' },
            { name: 'Title and summary', meaning: 'موضوعی که درس پوشش می‌دهد.', example: 'Containers vs images' },
            { name: 'Progress badge', meaning: 'درصدی که تا وقتی درس در جریان است نمایش داده می‌شود.', example: '5%' },
            { name: 'Quiz score', meaning: 'بهترین نتیجه شما در آزمون آن درس.', example: '4/5' },
            { name: 'Icons and time', meaning: 'آیکون هدف یعنی آزمون، آیکون فلاسک یعنی lab؛ آخرین مورد مدت درس است.', example: '12 min' },
          ],
        },
      ],
      example: {
        title: 'مثال: یادگیری یک موضوع و تمرین آن',
        steps: [
          'Academy را باز کنید، بعد Courses و Beginner را انتخاب کنید. یک دوره مثل Docker fundamentals را باز کنید و Start course را بزنید.',
          'درس را بخوانید، نمودار را باز کنید و بعد از تمام شدن در ستون سمت راست Mark complete را بزنید. Knowledge check را انجام دهید.',
          'اگر درس guided lab دارد، Open lab را بزنید، Enable sandbox را بزنید و دستور هر مرحله را بارگذاری و اجرا کنید.',
          'وقتی دستوری برایتان روشن نیست، Reference را باز کنید و آن را جستجو کنید، یا برای متن خطا از Search استفاده کنید. در پایان Reset Lab را بزنید تا منابع sandbox حذف شوند.',
        ],
      },
      tips: [
        'پیش‌نیازها فقط پیشنهادند؛ می‌توانید هر درسی را هر زمان باز کنید.',
        'دستورهای lab روی موتور واقعی Docker شما اجرا می‌شوند، ولی فقط در منابع برچسب‌دار، محدود و sandbox ای که Reset Lab آن‌ها را حذف می‌کند.',
        'یادداشت‌ها، پیشرفت و رضایت برای lab ها محلی ذخیره می‌شوند؛ بازنشانی پیشرفت در Settings آن‌ها را حذف می‌کند.',
        'یک نشان کنار Academy در نوار کناری پیشرفت کلی شما را نشان می‌دهد.',
      ],
    },

    'app/settings': {
      title: 'Settings (تنظیمات)',
      summary: 'گزینه‌های سراسری برنامه که بین همه فضاهای کاری مشترک‌اند: اتصال دستیار هوش مصنوعی، ظاهر، هدف یادگیری، خلاصه‌ای از مدل امنیتی و اطلاعات برنامه.',
      whenToUse: [
        'برای اتصال دستیار هوش مصنوعی به یک ارائه‌دهنده یا یک ابزار خط فرمان هوش مصنوعی محلی.',
        'برای جابه‌جایی بین تم تاریک، روشن یا سیستم، تغییر اندازه رابط یا کاهش حرکت.',
        'برای تغییر هدف یادگیری روزانه یا بازنشانی پیشرفت Academy.',
        'برای بررسی نسخه‌های OpsDeck، Electron، Chromium و Node هنگام درخواست کمک.',
      ],
      howItWorks: [
        'بیشتر گزینه‌ها با تغییر دادن فوراً اعمال می‌شوند و روی همین دستگاه ذخیره می‌شوند. کارت AI assistant دکمه Save settings مخصوص خودش را دارد.',
        'تنظیمات برای Docker، Kubernetes، Databases، Observability و Intelligence یکسان است.',
        'صفحه به دو ستون تقسیم شده است. چپ: AI assistant، Appearance، Learning، Security model. راست: Application، Workspaces، Keyboard، About the origin.',
      ],
      parts: [
        {
          name: 'Page header (سربرگ صفحه)',
          description: 'Reload content فایل‌های محتوای Academy را دوباره می‌خواند و صفحه را دوباره رسم می‌کند؛ یک toast می‌گوید موفق بود یا نه. Ask AI دستیار را برای صفحه Settings باز می‌کند.',
        },
        {
          name: 'AI assistant card',
          description: 'OpsDeck را به یک مدل زبانی وصل می‌کند تا بتوانید درباره منابع زنده سؤال بپرسید. یک نشان وضعیت Ready (سبز)، Setup needed (کهربایی)، Disabled یا Unavailable را نشان می‌دهد. خط زیر "OpsDeck AI" بعد از پیکربندی، ارائه‌دهنده و مدل را نشان می‌دهد. تا وقتی در دستیار Send را نزنید چیزی به مدل فرستاده نمی‌شود و کلیدهای حساس و مقدارهای محیطی به‌جای پوشانده شدن کنار گذاشته می‌شوند.',
          items: [
            { name: 'Open assistant', description: 'پنل دستیار را باز می‌کند.' },
            { name: 'Transport', description: 'نحوه دسترسی OpsDeck به یک مدل: یک API سازگار با OpenAI، یا یک ابزار خط فرمان محلی که از قبل روی این دستگاه نصب است (مثل OpenCode یا Claude Code). برای CLI، OpsDeck هرگز کلید API را ذخیره نمی‌کند و به‌جای آن وضعیت CLI را نشان می‌دهد.' },
            { name: 'Provider preset', description: 'برای transport از نوع API: یک ارائه‌دهنده شناخته‌شده را انتخاب کنید تا Base URL و مدل پر شود، یا Custom provider. یادداشتی در زیر، preset را توضیح می‌دهد.' },
            { name: 'Base URL', description: 'آدرس endpoint چت سازگار با OpenAI، مثلاً https://api.deepseek.com/v1.' },
            { name: 'Model', description: 'نام مدل، مثلاً deepseek-chat. برای transport از نوع CLI می‌توان آن را خالی گذاشت تا پیش‌فرض CLI استفاده شود؛ بعد از Detect models پیشنهادها ظاهر می‌شوند.' },
            { name: 'API key', description: 'کلید شما برای ارائه‌دهنده. وقتی کلیدی ذخیره شده باشد نشان سبز "saved" نمایش داده می‌شود؛ برای نگه داشتن آن کادر را خالی بگذارید. کلیدها در main process می‌مانند و در فایلی ذخیره می‌شوند که فقط خودتان می‌توانید بخوانید (mode 0600). ارائه‌دهنده‌های محلی بدون کلید ممکن است به آن نیاز نداشته باشند.' },
            { name: 'Enable OpsDeck AI checkbox', description: 'دستیار را در همه جا، از جمله دکمه‌های Ask AI، روشن یا خاموش می‌کند.' },
            { name: 'Save settings', description: 'انتخاب‌ها را ذخیره می‌کند. متن نتیجه کنار دکمه‌ها می‌گوید دستیار آماده است یا چه چیزی هنوز کم است.' },
            { name: 'Test connection', description: 'بررسی می‌کند که ارائه‌دهنده یا CLI با مقدارهای فعلی فرم پاسخ می‌دهد، بدون ذخیره کردن.' },
            { name: 'Detect models', description: 'فقط برای transport های CLI. مدل‌های موجود را از CLI می‌خواند و در فیلد Model پیشنهاد می‌دهد.' },
            { name: 'Clear key', description: 'وقتی کلیدی ذخیره شده باشد ظاهر می‌شود. آن را حذف می‌کند.' },
          ],
        },
        {
          name: 'Appearance card',
          description: 'ترجیح‌های ظاهری. Dark پیش‌فرض است.',
          items: [
            { name: 'Theme', description: 'Dark، Light یا System (از سیستم‌عامل شما پیروی می‌کند).' },
            { name: 'Interface scale', description: 'بزرگ‌نمایی فعلی را نشان می‌دهد، مثلاً 100%. Smaller و Larger آن را تغییر می‌دهند و Reset آن را به 100% برمی‌گرداند. همچنین می‌توانید از Ctrl و +، Ctrl و -، Ctrl و 0 یا نگه داشتن Ctrl و اسکرول استفاده کنید. مقیاس بین اجراها به خاطر سپرده می‌شود.' },
            { name: 'Reduce motion', description: 'بیشتر انیمیشن‌ها را خاموش می‌کند.' },
            { name: 'Reduce transparency and blur', description: 'پنل‌ها را مات می‌کند، که می‌تواند روی کارت گرافیک کند یا برای خوانایی کمک کند.' },
            { name: 'Collapse the sidebar by default', description: 'OpsDeck را با نوار کناری جمع‌شده به آیکون‌ها شروع می‌کند. همچنان می‌توانید آن را با Ctrl+B باز و بسته کنید.' },
          ],
        },
        {
          name: 'Learning card',
          description: 'تنظیمات Academy.',
          items: [
            { name: 'Lessons complete and Current streak', description: 'جمع‌های شما، مثلاً 12 / 90 lessons و 3 days.' },
            { name: 'Daily goal', description: 'دقیقه‌های مطالعه در روز: 10، 15، 20، 30، 45 یا 60. حلقه داشبورد Academy از آن استفاده می‌کند.' },
            { name: 'Reset all progress', description: 'بعد از تأیید قرمز، پیشرفت درس‌ها، نمره‌های آزمون، نشانک‌ها، یادداشت‌ها، دستاوردها و فعالیت را حذف می‌کند. قابل برگشت نیست. پیشرفت فقط روی همین دستگاه ذخیره می‌شود.' },
          ],
        },
        {
          name: 'Security model card',
          description: 'یک چک‌لیست از کارهایی که OpsDeck انجام می‌دهد و نمی‌دهد: Docker با فهرست آرگومان‌ها و بدون shell اجرا می‌شود؛ دستورها از نظر حالت privileged، namespace های host، device passthrough و mount کردن socket بررسی می‌شوند؛ رمزهای عبور registry هرگز توسط OpsDeck ذخیره نمی‌شوند؛ پنجره برنامه ایزوله است (context isolation، sandbox، بدون Node integration، سیاست محتوای سخت‌گیرانه). خط قرمز x پایانی یک هشدار است: OpsDeck نمی‌تواند شما را از daemon ای که از قبل معادل root است محافظت کند، پس دسترسی به Docker را مثل دسترسی ادمین در نظر بگیرید.',
        },
        {
          name: 'Application card',
          description: 'یک فهرست فقط‌خواندنی: Product، Version، Electron، Chromium، Node، Platform / architecture، Host name و Academy Content version. هنگام گزارش مشکل این‌ها را همراه کنید.',
        },
        {
          name: 'Workspaces card',
          description: 'هر فضای کاری (Docker، Kubernetes، Databases، Observability، Intelligence) را با نشان سبز "active"، یا نشان خاکستری "planned" برای هر کدام که هنوز در دسترس نیست فهرست می‌کند.',
        },
        {
          name: 'Keyboard card',
          description: 'میان‌برها: Ctrl+K پالت فرمان را باز می‌کند، Ctrl+B نوار کناری را باز و بسته می‌کند، Ctrl+Shift+F جستجوی Academy را باز می‌کند، Esc یک پوشش را می‌بندد و / در صفحه‌هایی که کادر جستجو دارند روی آن فوکوس می‌کند. Ctrl+Shift+A دستیار هوش مصنوعی را برای صفحه فعلی باز می‌کند.',
        },
        {
          name: 'About the origin card',
          description: 'بیان می‌کند که OpsDeck یک استودیوی عملیات مستقل است، محتوای Academy برای همین برنامه نوشته شده و Docker و لوگوی Docker علائم تجاری Docker, Inc. هستند و هیچ وابستگی ای وجود ندارد. دکمه Glossary واژه‌نامه Academy را باز می‌کند.',
        },
      ],
      example: {
        title: 'مثال: اتصال دستیار هوش مصنوعی با کلید API',
        steps: [
          'در کارت AI assistant، Transport را روی OpenAI-compatible API نگه دارید و یک Provider preset انتخاب کنید؛ Base URL و Model پر می‌شوند.',
          'کلید API خود را در API key بچسبانید.',
          'Test connection را بزنید. منتظر پیام موفقیت سبز بمانید.',
          'Save settings را بزنید. نشان به Ready تغییر می‌کند. حالا از هر دکمه Ask AI استفاده کنید؛ تا وقتی در دستیار Send را نزنید چیزی ارسال نمی‌شود.',
        ],
      },
      tips: [
        'کلید API شما بعد از ذخیره دیگر نشان داده نمی‌شود؛ کادر "Saved - leave blank to keep it" را نشان می‌دهد.',
        'اگر نمی‌خواهید داده‌ای به جایی ارسال شود، تیک Enable OpsDeck AI را بردارید.',
        'تغییر تم یا مقیاس فوری است و به دکمه ذخیره نیاز ندارد.',
        'Reset all progress دائمی است. برگشتی ندارد.',
      ],
    },
  });
})();
