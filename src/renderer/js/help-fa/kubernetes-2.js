'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.helpFa = OD.helpFa || {};
  Object.assign(OD.helpFa, {
      "kubernetes/persistentvolumes": {
        "title": "Persistent volumes (والیوم‌های پایدار)",
        "summary": "PersistentVolumeها (PV) را فهرست می‌کند: تکه‌هایی از فضای ذخیره‌سازی واقعی (دیسک ابری، NFS share یا یک پوشهٔ محلی) که در دسترس کلاستر هستند.",
        "whenToUse": [
          "یک volume claim در وضعیت Pending مانده و می‌خواهید بدانید volume مناسبی وجود دارد یا نه.",
          "می‌خواهید ببینید کدام claim از کدام volume استفاده می‌کند، یا volumeهای Released بازمانده را پیدا کنید."
        ],
        "howItWorks": [
          "PV خودِ فضای ذخیره‌سازی است و claim (یعنی PVC) درخواست فضاست. Kubernetes آن‌ها را به هم وصل (bind) می‌کند. معمولاً PVها خودکار توسط یک storage class ساخته می‌شوند. وضعیت‌ها: Bound (سبز، در حال استفادهٔ یک claim)، Available (آزاد)، Released (نارنجی، claim حذف شده ولی هنوز بازیافت نشده)، Failed (قرمز).",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "cluster-scoped badge",
                "description": "به‌جای انتخاب Namespace نمایش داده می‌شود. این نوع آبجکت به کل کلاستر تعلق دارد و نه به یک Namespace، پس چیزی برای فیلتر کردن وجود ندارد."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Persistent volumes card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (این فهرست مربوط به کل کلاستر است). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No persistent volumes\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. این نوع آبجکت در OpsDeck فقط‌خواندنی است: پایین پنل عبارت \"This object is read-only in OpsDeck\" و دکمه Ask AI دیده می‌شود، پس اینجا نمی‌توانید آن را تغییر دهید یا حذف کنید.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست volumeها، describe و claimها در همهٔ Namespaceها. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Persistent volumes table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام volume، که اغلب pvc- و بعد یک شناسهٔ تصادفی است."
              },
              {
                "name": "Capacity",
                "meaning": "اندازهٔ volume.",
                "example": "10Gi"
              },
              {
                "name": "Access",
                "meaning": "روش mount شدن: ReadWriteOnce (یک node)، ReadOnlyMany، ReadWriteMany (چند node).",
                "example": "ReadWriteOnce"
              },
              {
                "name": "Reclaim",
                "meaning": "وقتی claim حذف شود چه می‌شود: Delete (فضا پاک می‌شود) یا Retain (برای پاک‌سازی دستی نگه داشته می‌شود).",
                "example": "Delete"
              },
              {
                "name": "Status",
                "meaning": "یکی از Bound، Available، Released یا Failed.",
                "example": "Bound"
              },
              {
                "name": "Claim",
                "meaning": "Namespace و نام claim‌ای که از آن استفاده می‌کند.",
                "example": "shop/data-postgres-0"
              },
              {
                "name": "Class",
                "meaning": "storage class‌ای که آن را ساخته است.",
                "example": "standard"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: پیدا کردن volumeهای بازمانده",
          "steps": [
            "Persistent volumes را باز کنید و دنبال ردیف‌های نارنجی Released بگردید.",
            "ستون Claim نشان می‌دهد پیش‌تر کدام claim از آن استفاده می‌کرده است.",
            "اگر سیاست reclaim برابر Retain باشد، داده‌ها هنوز هست: با ابزارهای خودتان تصمیم بگیرید دوباره استفاده یا پاک‌سازی کنید."
          ]
        },
        "tips": [
          "PVها در OpsDeck فقط‌خواندنی هستند: اینجا چیزی حذف نمی‌شود.",
          "سیاست Retain از داده محافظت می‌کند، اما volumeها (و هزینه) را باقی می‌گذارد."
        ]
      },
      "kubernetes/persistentvolumeclaims": {
        "title": "Volume claims (درخواست‌های ذخیره‌سازی)",
        "summary": "PersistentVolumeClaimها (PVC) را فهرست می‌کند: درخواست‌های فضای ذخیره‌سازی که برنامه‌ها می‌دهند. Pod با mount کردن یک claim دیسکی می‌گیرد که با ری‌استارت از بین نمی‌رود.",
        "whenToUse": [
          "یک Pod برای گرفتن فضای ذخیره‌سازی در وضعیت Pending مانده است.",
          "می‌خواهید ببینید هر برنامه چقدر فضا خواسته است."
        ],
        "howItWorks": [
          "claim یک اندازه، access mode و storage class مشخص می‌کند. Kubernetes یک volume (PV) مناسب پیدا یا ایجاد می‌کند و آن را bind می‌کند. وضعیت: Bound (سبز) یعنی آماده، Pending (نارنجی) یعنی هنوز منتظر است.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Volume claims card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No volume claims\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI. حذف یک claim، بسته به سیاست reclaim مربوط به volume، می‌تواند داده‌ها را هم پاک کند.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست claimها (wide)، describe و فهرست Podهای Namespace که ممکن است claim را mount کنند. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Volume claims table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام claim."
              },
              {
                "name": "Status",
                "meaning": "Bound، Pending یا Lost (قرمز).",
                "example": "Bound"
              },
              {
                "name": "Volume",
                "meaning": "نام PV‌ای که به آن bind شده است.",
                "example": "pvc-3f9a..."
              },
              {
                "name": "Capacity",
                "meaning": "اندازهٔ واقعی که داده شده است.",
                "example": "10Gi"
              },
              {
                "name": "Access",
                "meaning": "حالت‌های دسترسی.",
                "example": "ReadWriteOnce"
              },
              {
                "name": "Class",
                "meaning": "storage class مورد استفاده.",
                "example": "standard"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: Pod دیتابیس در وضعیت Pending است",
          "steps": [
            "Volume claims را باز کنید و \"data-postgres-0\" را پیدا کنید.",
            "اگر Status آن Pending است، تب Events را باز کنید: پیام‌هایی مثل \"no persistent volumes available\" یا \"storageclass not found\" دلیل را توضیح می‌دهند.",
            "صفحه Storage classes را برای وجود یک کلاس پیش‌فرض بررسی کنید."
          ]
        },
        "tips": [
          "حذف claim‌ای که یک Pod در حال اجرا از آن استفاده می‌کند خطرناک است؛ اول Pod را متوقف کنید.",
          "Pending همراه با Class خالی معمولاً یعنی storage class پیش‌فرض وجود ندارد."
        ]
      },
      "kubernetes/storageclasses": {
        "title": "Storage classes (کلاس‌های ذخیره‌سازی)",
        "summary": "StorageClassها را فهرست می‌کند: قالب‌هایی که به Kubernetes می‌گویند وقتی claim‌ای فضا بخواهد، چطور خودکار ذخیره‌سازی بسازد (کدام ارائه‌دهنده، با چه سیاستی).",
        "whenToUse": [
          "یک claim در وضعیت Pending است و می‌خواهید بدانید کلاس پیش‌فرض وجود دارد یا نه.",
          "می‌خواهید ببینید کلاستر چه backendهای ذخیره‌سازی‌ای ارائه می‌دهد."
        ],
        "howItWorks": [
          "وقتی claim نام یک کلاس را بدهد (یا هیچ کلاسی نگوید تا پیش‌فرض استفاده شود)، provisioner آن کلاس یک volume مناسب می‌سازد. نشان Default روی کلاسی سبز است که وقتی claim کلاسی مشخص نکند به کار می‌رود.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "cluster-scoped badge",
                "description": "به‌جای انتخاب Namespace نمایش داده می‌شود. این نوع آبجکت به کل کلاستر تعلق دارد و نه به یک Namespace، پس چیزی برای فیلتر کردن وجود ندارد."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Storage classes card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (این فهرست مربوط به کل کلاستر است). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No storage classes\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. این نوع آبجکت در OpsDeck فقط‌خواندنی است: پایین پنل عبارت \"This object is read-only in OpsDeck\" و دکمه Ask AI دیده می‌شود، پس اینجا نمی‌توانید آن را تغییر دهید یا حذف کنید.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست storage classها و describe (سیاست reclaim، binding mode و پارامترها). هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Storage classes table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام کلاس."
              },
              {
                "name": "Provisioner",
                "meaning": "درایوری که فضای ذخیره‌سازی را می‌سازد.",
                "example": "rancher.io/local-path"
              },
              {
                "name": "Reclaim",
                "meaning": "سیاست reclaim پیش‌فرض برای volumeهایی که می‌سازد (Delete یا Retain).",
                "example": "Delete"
              },
              {
                "name": "Binding",
                "meaning": "زمان ساخته شدن volume: Immediate، یا WaitForFirstConsumer (وقتی یک Pod به آن نیاز پیدا کند).",
                "example": "WaitForFirstConsumer"
              },
              {
                "name": "Expansion",
                "meaning": "\"yes\" اگر بعداً بتوان اندازهٔ claimها را تغییر داد.",
                "example": "yes"
              },
              {
                "name": "Default",
                "meaning": "نشان سبز \"default\" اگر کلاس پیش‌فرض باشد، وگرنه \"no\".",
                "example": "default"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: بررسی وجود کلاس پیش‌فرض",
          "steps": [
            "Storage classes را باز کنید.",
            "در ستون Default دنبال نشان سبز \"default\" بگردید.",
            "اگر هیچ‌کدام نبود، claimهای بدون کلاس در وضعیت Pending می‌مانند."
          ]
        },
        "tips": [
          "WaitForFirstConsumer عادی است: claimها تا وقتی Pod از آن‌ها استفاده نکند Pending می‌مانند."
        ]
      },
      "kubernetes/configmaps": {
        "title": "ConfigMaps",
        "summary": "ConfigMapها را فهرست می‌کند: بسته‌هایی از تنظیمات غیرمحرمانه (جفت‌های key-value یا فایل کامل) که Podها به‌شکل environment variable یا فایل mount‌شده می‌خوانند.",
        "whenToUse": [
          "می‌خواهید بدانید یک برنامه چه تنظیماتی دریافت می‌کند.",
          "برنامه بعد از تغییر config رفتار دیگری دارد و می‌خواهید keyها را ببینید."
        ],
        "howItWorks": [
          "ConfigMap تنظیمات را از image کانتینر جدا نگه می‌دارد تا بدون build دوباره بتوانید تنظیمات را عوض کنید. ستون Keys تعداد ورودی‌ها را می‌شمارد. معمولاً Podها برای دیدن تغییر باید ری‌استارت شوند.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "ConfigMaps card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No configmaps\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI. حذف ConfigMap‌ای که Podها استفاده می‌کنند می‌تواند آن‌ها را خراب کند.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست configmapها، describe و یک دستور فقط-keys (نام‌ها بدون مقدار). هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "ConfigMaps table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام ConfigMap."
              },
              {
                "name": "Keys",
                "meaning": "تعداد ورودی‌هایی که دارد (متنی و باینری).",
                "example": "3 می‌تواند LOG_LEVEL، API_URL و app.conf باشد"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: دیدن تنظیماتی که یک برنامه می‌خواند",
          "steps": [
            "ConfigMaps را باز کنید و روی \"shop-config\" کلیک کنید.",
            "نام keyها را در تب Summary بخوانید و برای دیدن مقدارها تب Manifest را باز کنید.",
            "برای اعمال تغییر، Deployment مربوطه را از صفحه Deployments ری‌استارت کنید."
          ]
        },
        "tips": [
          "هرگز رمز عبور را در ConfigMap نگذارید؛ از Secrets استفاده کنید.",
          "مقدارهای ConfigMap در تب‌های Manifest و Describe دیده می‌شوند."
        ]
      },
      "kubernetes/secrets": {
        "title": "Secrets (رازها)",
        "summary": "Secretها را فهرست می‌کند: آبجکت‌هایی که داده‌های حساس مثل رمز عبور، token و گواهی TLS نگه می‌دارند. OpsDeck نام، نوع و تعداد keyها را نشان می‌دهد و هرگز مقدارها را نه.",
        "whenToUse": [
          "می‌خواهید بررسی کنید یک secret وجود دارد و keyهای مورد انتظار را دارد.",
          "یک Pod به‌دلیل نبودن secret بالا نمی‌آید."
        ],
        "howItWorks": [
          "Secretها برای داده‌های حساس هستند که Podها به‌شکل environment variable یا فایل می‌خوانند. Type هدف آن را می‌گوید، مثلاً Opaque (عمومی) یا kubernetes.io/tls (گواهی). یادآوری پایین کارت: \"Secret values are never read into this view\".",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Secrets card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No secrets\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI. تب Manifest هرگز مقدار secret ندارد و تب Commands خروجی JSON را برای secretها حذف می‌کند.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست secretها، describe (فقط نام و اندازهٔ keyها) و یک دستور فقط-keys. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Secrets table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام Secret."
              },
              {
                "name": "Type",
                "meaning": "نوع secret. kubernetes.io/tls فیروزه‌ای است؛ بقیه مثل Opaque نارنجی.",
                "example": "kubernetes.io/tls"
              },
              {
                "name": "Keys",
                "meaning": "تعداد ورودی‌های داده.",
                "example": "2 (tls.crt و tls.key)"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: بررسی وجود یک secret از نوع TLS",
          "steps": [
            "Secrets را باز کنید و دنبال \"shop-tls\" بگردید.",
            "Type باید kubernetes.io/tls و Keys برابر 2 باشد.",
            "روی ردیف کلیک کنید و برای مشکلات از تب Events یا Describe استفاده کنید؛ نام keyها نمایش داده می‌شود اما مقدارها نه."
          ]
        },
        "tips": [
          "حذف یک secret می‌تواند Podهایی را که از آن استفاده می‌کنند خراب کند و برگشتی ندارد.",
          "Secretها در Kubernetes فقط base64 هستند و به‌طور پیش‌فرض رمزنگاری نمی‌شوند؛ برای همین OpsDeck هرگز آن‌ها را نشان نمی‌دهد."
        ]
      },
      "kubernetes/resourcequotas": {
        "title": "Resource quotas (سهمیه منابع)",
        "summary": "ResourceQuotaها را فهرست می‌کند: محدودیت‌هایی برای کل مقداری که یک Namespace می‌تواند مصرف کند (CPU، حافظه، تعداد Pod و غیره).",
        "whenToUse": [
          "Podهای جدید با پیام \"exceeded quota\" رد می‌شوند.",
          "می‌خواهید ببینید یک Namespace چقدر به سقف خود نزدیک است."
        ],
        "howItWorks": [
          "quota یک سقف سخت برای کل Namespace تعیین می‌کند. ستون Usage برای حداکثر شش منبع، مقدار مصرف‌شده/سقف را نشان می‌دهد. وقتی به سقف برسد، Kubernetes آبجکت‌های جدید را رد می‌کند.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Resource quotas card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No resource quotas\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI. حذف یک quota سقف را برمی‌دارد.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست quotaها و describe (سقف‌های hard و مصرف فعلی). هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Resource quotas table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام quota."
              },
              {
                "name": "Usage",
                "meaning": "مصرف‌شده / سقف hard برای هر منبع، با کاما جدا شده.",
                "example": "pods 8/10, requests.cpu 3/4 یعنی 8 از 10 Pod و 3 از 4 CPU درخواست شده"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: Deployment نمی‌تواند Pod اضافه کند",
          "steps": [
            "Resource quotas را در Namespace مورد نظر باز کنید.",
            "Usage را بخوانید، مثلاً pods 10/10: سقف پر شده است.",
            "quota را با ابزارهای خودتان بالا ببرید یا با کم کردن replicas چیز دیگری ظرفیت آزاد کنید."
          ]
        },
        "tips": [
          "quotaها درخواست‌ها (requests) را می‌شمارند، نه مصرف واقعی را.",
          "برای دیدن فهرست کامل Hard و Used تب Summary جزئیات را باز کنید."
        ]
      },
      "kubernetes/limitranges": {
        "title": "Limit ranges (محدوده‌های منابع)",
        "summary": "LimitRangeها را فهرست می‌کند: مقدارهای پیش‌فرض و حداقل/حداکثر CPU و حافظه برای هر Pod یا هر کانتینر داخل یک Namespace.",
        "whenToUse": [
          "Podها مقدارهای CPU یا حافظه‌ای گرفته‌اند که خودتان تعیین نکرده‌اید.",
          "یک Pod رد شده چون بیش از حد یا خیلی کم منبع خواسته است."
        ],
        "howItWorks": [
          "اگر کانتینری requests و limits خودش را مشخص نکند، LimitRange مقدارهای پیش‌فرض را پر می‌کند. همچنین می‌تواند مقدارهای خارج از min یا max را رد کند. ستون Limits هر نوع را با تعداد مقدارهای default و max خلاصه می‌کند.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Limit ranges card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No limit ranges\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست limit rangeها و describe (سقف‌ها و مقدارهای فعلی). هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Limit ranges table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام limit range."
              },
              {
                "name": "Limits",
                "meaning": "هر نوع limit با تعداد مقدارهای default و max که تعیین می‌کند.",
                "example": "Container (2 defaults, 1 max)"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: چرا Pod من 500m CPU می‌گیرد؟",
          "steps": [
            "Limit ranges را برای Namespace باز کنید.",
            "روی ردیف کلیک کنید و تب Summary را بخوانید: یک limit پیش‌فرض 500m برای CPU روی کانتینرهایی که مقدار خودشان را ندارند اعمال می‌شود.",
            "برای override کردن آن، در Deployment خودتان resources را صریح تعیین کنید."
          ]
        },
        "tips": [
          "Limit rangeها فقط روی Podهای جدید اعمال می‌شوند، نه Podهای موجود."
        ]
      },
      "kubernetes/serviceaccounts": {
        "title": "Service accounts (حساب‌های سرویس)",
        "summary": "ServiceAccountها را فهرست می‌کند: هویت‌هایی که Podها هنگام صحبت با API کوبرنتیز از آن‌ها استفاده می‌کنند.",
        "whenToUse": [
          "یک Pod از API خطای \"forbidden\" می‌گیرد.",
          "می‌خواهید بدانید چه هویت‌هایی در یک Namespace وجود دارد."
        ],
        "howItWorks": [
          "هر Pod با یک service account اجرا می‌شود (اگر چیزی تعیین نشود، همان \"default\"). مجوزها از Role bindingهایی می‌آیند که به آن حساب اشاره می‌کنند. Automount می‌گوید token آن به‌طور خودکار داخل Podها mount می‌شود یا نه.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Service accounts card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No service accounts\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI. Podهایی که از حساب حذف‌شده استفاده می‌کنند ممکن است بالا نیایند.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست service accountها، describe و یک دستور فقط-کپی \"Permissions\" (همان kubectl auth can-i --list با هویت آن حساب). هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Service accounts table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام service account."
              },
              {
                "name": "Secrets",
                "meaning": "تعداد secretهای متصل به آن.",
                "example": "0 در نسخه‌های فعلی Kubernetes"
              },
              {
                "name": "Pull secrets",
                "meaning": "تعداد image pull secretها (برای registryهای خصوصی image).",
                "example": "1"
              },
              {
                "name": "Automount",
                "meaning": "آیا token مربوط به API خودکار mount می‌شود: yes، no یا default.",
                "example": "default"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: دادن دسترسی به registry خصوصی به یک Pod",
          "steps": [
            "Service accounts را باز کنید و حسابی را که Pod استفاده می‌کند پیدا کنید.",
            "بررسی کنید Pull secrets دست‌کم 1 باشد.",
            "اگر 0 است، باید لاگین registry را با ابزارهای خودتان به آن حساب اضافه کنید."
          ]
        },
        "tips": [
          "Automount برابر \"no\" برای Podهایی که هرگز API را صدا نمی‌زنند امنیت را بهتر می‌کند.",
          "برای فهمیدن کارهایی که یک حساب مجاز است انجام دهد، Role bindings را ببینید."
        ]
      },
      "kubernetes/roles": {
        "title": "Roles (نقش‌ها)",
        "summary": "Roleها را فهرست می‌کند: مجموعه‌هایی از مجوزها (قوانین RBAC) که داخل یک Namespace اعمال می‌شوند، مثل \"may read pods\".",
        "whenToUse": [
          "می‌خواهید ببینید یک role چه مجوزهایی می‌دهد.",
          "در حال بازبینی این هستید که چه کسانی در یک Namespace می‌توانند چیزی را حذف کنند."
        ],
        "howItWorks": [
          "یک Role به‌تنهایی چیزی نمی‌دهد؛ یک Role binding آن را به کاربر، گروه یا service account وصل می‌کند. قوانین، verbها (get، list، create، delete و ...) را روی resourceها (pods، secrets و ...) فهرست می‌کنند. روی یک ردیف کلیک کنید تا هر قانون به شکل \"verbs on resources\" نوشته شده را ببینید.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Roles card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No roles\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست roleها، describe (resourceها، verbها و API groupها) و فهرست \"auth can-i\" برای کاربر فعال. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Roles table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام role."
              },
              {
                "name": "Rules",
                "meaning": "تعداد قوانین مجوز.",
                "example": "3"
              },
              {
                "name": "Verbs",
                "meaning": "عملیات متمایزی که در مجموع قوانین داده شده (8 مورد اول).",
                "example": "get, list, watch"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: بررسی یک role فقط‌خواندنی",
          "steps": [
            "Roles را باز کنید و روی \"pod-reader\" کلیک کنید.",
            "بخش Rules را بخوانید، مثلاً \"get, list, watch on pods\".",
            "Role bindings را باز کنید تا ببینید چه کسی این role را دارد."
          ]
        },
        "tips": [
          "verbهایی مثل \"*\" یا delete روی secrets قدرتمندند؛ اول آن‌ها را نگاه کنید.",
          "برای مجوزهای سطح کلاستر Cluster roles را ببینید."
        ]
      },
      "kubernetes/rolebindings": {
        "title": "Role bindings (اتصال نقش)",
        "summary": "RoleBindingها را فهرست می‌کند: پیوندهایی که یک Role (یا ClusterRole) را داخل یک Namespace به کاربران، گروه‌ها یا service accountها می‌دهند.",
        "whenToUse": [
          "می‌خواهید بدانید چه کسانی به یک Namespace دسترسی دارند.",
          "یک شخص یا برنامه دسترسی‌اش رد می‌شود و باید binding آن را بررسی کنید."
        ],
        "howItWorks": [
          "binding می‌گوید \"subject X در این Namespace نقش Y را می‌گیرد\". ستون Role نوع و نام را نشان می‌دهد (Role/pod-reader یا ClusterRole/view). Subjects تا چهار مورد را به شکل kind:name نشان می‌دهد.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Role bindings card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No role bindings\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. پایین پنل یک دکمه قرمز Delete هست (اول می‌پرسد \"Delete <name>?\" و بعد یک درخواست حذف واقعی به کلاستر انتخاب‌شده می‌فرستد؛ ممکن است Kubernetes آبجکت‌های وابسته به آن را هم پاک کند) و دکمه Ask AI. حذف آن دسترسی‌ای را که داده بود برمی‌دارد.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست role bindingها و describe (ارجاع به role و subjectها). هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Role bindings table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام binding."
              },
              {
                "name": "Role",
                "meaning": "Role یا ClusterRole‌ای که داده می‌شود.",
                "example": "ClusterRole/view"
              },
              {
                "name": "Subjects",
                "meaning": "چه کسی آن را می‌گیرد: kind:name، حداکثر چهار مورد.",
                "example": "ServiceAccount:ci-bot, User:anna"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: چه کسی می‌تواند Namespace مربوط به shop را ویرایش کند؟",
          "steps": [
            "Role bindings را با Namespace \"shop\" باز کنید.",
            "دنبال roleهایی مثل ClusterRole/edit یا ClusterRole/admin بگردید.",
            "ستون Subjects را بخوانید تا کاربران و service accountها را ببینید."
          ]
        },
        "tips": [
          "ClusterRole که در یک RoleBinding استفاده شود فقط در همین Namespace اعمال می‌شود."
        ]
      },
      "kubernetes/clusterroles": {
        "title": "Cluster roles (نقش‌های کلاستر)",
        "summary": "ClusterRoleها را فهرست می‌کند: مجموعه‌های مجوز که برای کل کلاستر تعریف می‌شوند، از جمله دسترسی به آبجکت‌های سطح کلاستر مثل nodeها.",
        "whenToUse": [
          "می‌خواهید بدانید roleهای داخلی مثل admin، edit، view و cluster-admin چه چیزی را مجاز می‌کنند.",
          "در حال بازبینی roleهای پرقدرت هستید."
        ],
        "howItWorks": [
          "مثل Role هستند، اما به یک Namespace وابسته نیستند. می‌توان آن‌ها را در کل کلاستر داد (Cluster role binding) یا داخل یک Namespace دوباره استفاده کرد (Role binding). role با نام cluster-admin می‌تواند هر کاری انجام دهد.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "cluster-scoped badge",
                "description": "به‌جای انتخاب Namespace نمایش داده می‌شود. این نوع آبجکت به کل کلاستر تعلق دارد و نه به یک Namespace، پس چیزی برای فیلتر کردن وجود ندارد."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Cluster roles card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (این فهرست مربوط به کل کلاستر است). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No cluster roles\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. این نوع آبجکت در OpsDeck فقط‌خواندنی است: پایین پنل عبارت \"This object is read-only in OpsDeck\" و دکمه Ask AI دیده می‌شود، پس اینجا نمی‌توانید آن را تغییر دهید یا حذف کنید.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست cluster roleها، describe و فهرست \"auth can-i\" برای کاربر فعال. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Cluster roles table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام role. نام‌هایی که با system: شروع می‌شوند متعلق به خود Kubernetes هستند."
              },
              {
                "name": "Rules",
                "meaning": "تعداد قوانین مجوز.",
                "example": "12"
              },
              {
                "name": "Verbs",
                "meaning": "عملیات متمایز داده‌شده (8 مورد اول).",
                "example": "get, list, watch, create"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: بازبینی role داخلی view",
          "steps": [
            "Cluster roles را باز کنید و روی \"view\" کلیک کنید.",
            "Rules را در تب Summary بخوانید: فقط get، list و watch.",
            "Cluster bindings یا Role bindings را باز کنید تا ببینید چه کسی از آن استفاده می‌کند."
          ]
        },
        "tips": [
          "Cluster roleها اینجا فقط‌خواندنی هستند.",
          "بسیاری از roleهای system: برای کار کردن کلاستر ضروری‌اند."
        ]
      },
      "kubernetes/clusterrolebindings": {
        "title": "Cluster bindings (اتصال نقش کلاستری)",
        "summary": "ClusterRoleBindingها را فهرست می‌کند: پیوندهایی که یک ClusterRole را در کل کلاستر به کاربران، گروه‌ها یا service accountها می‌دهند.",
        "whenToUse": [
          "می‌خواهید بدانید چه کسانی دسترسی سطح کلاستر دارند، به‌ویژه cluster-admin.",
          "بازبینی مجوزهای بیش از حد گسترده."
        ],
        "howItWorks": [
          "برخلاف Role binding، این دسترسی در همهٔ Namespaceها و روی آبجکت‌های سطح کلاستر اعمال می‌شود. ستون Role نقش داده‌شده را نشان می‌دهد و Subjects تا چهار دارنده را.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "cluster-scoped badge",
                "description": "به‌جای انتخاب Namespace نمایش داده می‌شود. این نوع آبجکت به کل کلاستر تعلق دارد و نه به یک Namespace، پس چیزی برای فیلتر کردن وجود ندارد."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Cluster bindings card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (این فهرست مربوط به کل کلاستر است). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No cluster bindings\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. این نوع آبجکت در OpsDeck فقط‌خواندنی است: پایین پنل عبارت \"This object is read-only in OpsDeck\" و دکمه Ask AI دیده می‌شود، پس اینجا نمی‌توانید آن را تغییر دهید یا حذف کنید.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: فهرست cluster role bindingها و describe. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Cluster bindings table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام binding."
              },
              {
                "name": "Role",
                "meaning": "ClusterRole‌ای که داده شده است.",
                "example": "ClusterRole/cluster-admin"
              },
              {
                "name": "Subjects",
                "meaning": "چه کسی آن را می‌گیرد، به شکل kind:name (حداکثر چهار مورد).",
                "example": "User:anna, Group:system:masters"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: پیدا کردن cluster-admin‌ها",
          "steps": [
            "Cluster bindings را باز کنید.",
            "دنبال ردیف‌هایی بگردید که Role آن‌ها ClusterRole/cluster-admin است.",
            "Subjects را بخوانید و برای فهرست کامل روی ردیف کلیک کنید."
          ]
        },
        "tips": [
          "باید تعداد کمی subject دارای cluster-admin باشند؛ موارد اضافه خطر امنیتی‌اند.",
          "در OpsDeck فقط‌خواندنی است."
        ]
      },
      "kubernetes/helm": {
        "title": "Helm releases (نسخه‌های Helm)",
        "summary": "برنامه‌هایی را فهرست می‌کند که با Helm، مدیر بسته‌های Kubernetes، در کلاستر نصب شده‌اند.",
        "whenToUse": [
          "می‌خواهید بدانید چه برنامه‌هایی (chart) و با چه نسخه‌ای نصب شده‌اند.",
          "می‌خواهید ببینید یک release با موفقیت deploy شده است یا نه."
        ],
        "howItWorks": [
          "chart یک برنامهٔ بسته‌بندی‌شده است؛ نصب آن یک release (نمونهٔ نام‌دار، مثلاً \"grafana\") می‌سازد. هر upgrade شمارهٔ Revision را زیاد می‌کند.",
          "فهرست را خود برنامهٔ Helm با Context انتخاب‌شده تولید می‌کند. اگر Helm نصب نباشد، صفحه یک اعلان نارنجی \"Helm is not ready\" با دکمه \"Open tools\" نشان می‌دهد.",
          "این صفحه فقط‌خواندنی است و ردیف‌هایش پنل کناری باز نمی‌کنند. صفحه هنگام باز شدن یک بار می‌خواند؛ برای به‌روزرسانی از Refresh استفاده کنید.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Releases card",
            "description": "زیرعنوان تعداد releaseها را نشان می‌دهد (و هنگام کوتاه شدن فهرست \"showing first 500 of N\"). پیام خالی: \"No Helm releases\"."
          },
          {
            "name": "Ready-made Helm commands (دستورهای آمادهٔ Helm)",
            "description": "دستورهای فقط-کپی برای releases، status، history و values. آن‌ها از --kube-context استفاده می‌کنند تا کلاستر انتخاب‌شده را هدف بگیرند. آن‌ها را در ترمینال خودتان Paste کنید؛ از اینجا قابل اجرا نیستند."
          }
        ],
        "tables": [
          {
            "name": "Releases table",
            "columns": [
              {
                "name": "Name",
                "meaning": "نام release."
              },
              {
                "name": "Namespace",
                "meaning": "Namespace‌ای که release در آن قرار دارد.",
                "example": "monitoring"
              },
              {
                "name": "Revision",
                "meaning": "شمارندهٔ upgrade. 1 اولین نصب است.",
                "example": "4"
              },
              {
                "name": "Updated",
                "meaning": "آخرین زمانی که release تغییر کرده است.",
                "example": "یک timestamp"
              },
              {
                "name": "Status",
                "meaning": "وضعیت release که Helm گزارش می‌کند.",
                "example": "deployed, failed or pending-upgrade"
              },
              {
                "name": "Chart",
                "meaning": "نام و نسخهٔ chart.",
                "example": "grafana-7.3.0"
              },
              {
                "name": "App version",
                "meaning": "نسخهٔ برنامه‌ای که chart نصب می‌کند.",
                "example": "10.4.1"
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: بررسی موفق بودن یک upgrade",
          "steps": [
            "Helm releases را باز کنید و اگر نمی‌دانید release در کدام Namespace است، \"All namespaces\" را روشن کنید.",
            "release را پیدا کنید و Status را بخوانید: \"deployed\" خوب است و \"failed\" بد.",
            "دستور \"History\" را کپی کنید و در ترمینال خودتان اجرا کنید تا revisionهای قبلی را ببینید."
          ]
        },
        "tips": [
          "اگر Helm نصب نباشد، از Local tools نصب می‌شود.",
          "دستورهای Helm چیزی را تغییر نمی‌دهند؛ فقط می‌خوانند."
        ]
      },
      "kubernetes/events": {
        "title": "Events (رویدادها)",
        "summary": "رویدادهای کلاستر را فهرست می‌کند: پیام‌های کوتاهی که Kubernetes هنگام اتفاق افتادن چیزی برای یک آبجکت ثبت می‌کند، مثل زمان‌بندی (schedule) شدن یک Pod، شکست خوردن pull شدن یک image یا شکست یک probe.",
        "whenToUse": [
          "چیزی کار نمی‌کند و توضیح خود کلاستر را می‌خواهید.",
          "می‌خواهید ببینید اخیراً در یک Namespace چه اتفاقی افتاده است."
        ],
        "howItWorks": [
          "رویدادها از جدید به قدیم مرتب می‌شوند. فقط مدت کوتاهی (حدود یک ساعت) نگه داشته می‌شوند، پس تاریخچهٔ قدیمی‌تر از بین رفته است. رویدادهای Warning نارنجی و عادی‌ها خاکستری‌اند. Count می‌گوید یک رویداد چند بار تکرار شده است.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Events card",
            "description": "کارت اصلی صفحه. زیرعنوان آن تعداد آبجکت‌های دریافت‌شده را نشان می‌دهد (مثلاً \"12 objects\") (در Namespace انتخاب‌شده، یا در کل کلاستر با \"All namespaces\"). اگر بیش از 500 آبجکت باشد، عبارت \"showing first 500 of N\" دیده می‌شود و بقیه نمایش داده نمی‌شوند. اگر کلاستر درخواست را رد کند (مثلاً به‌دلیل نبودن دسترسی)، یک بنر قرمز خطا را توضیح می‌دهد و دکمه Refresh می‌دهد. اگر چیزی پیدا نشود، یک پیام خالی مثل \"No events\" می‌بینید."
          },
          {
            "name": "Actions column (ستون عملیات)",
            "description": "دکمه‌های آیکونی کوچک در انتهای هر ردیف.",
            "items": [
              {
                "name": "Click a row",
                "description": "پنل جزئیات کناری همان آبجکت را باز می‌کند (بخش \"Details side panel\" را ببینید)."
              },
              {
                "name": "Ask AI (sparkles icon)",
                "description": "یک سؤال هوش مصنوعی دربارهٔ همین آبجکت باز می‌کند و اطلاعات زندهٔ پاک‌سازی‌شده را پیوست می‌کند."
              },
              {
                "name": "Copy name (copy icon)",
                "description": "نام آبجکت را در کلیپ‌بورد کپی می‌کند تا در یک دستور Paste کنید."
              },
              {
                "name": "Details (info icon)",
                "description": "مثل کلیک روی ردیف است: پنل کناری را باز می‌کند."
              }
            ]
          },
          {
            "name": "Details side panel (پنل جزئیات)",
            "description": "با کلیک روی یک ردیف از سمت راست باز می‌شود. تب‌ها بالا هستند و دکمه‌ها پایین. این نوع آبجکت در OpsDeck فقط‌خواندنی است: پایین پنل عبارت \"This object is read-only in OpsDeck\" و دکمه Ask AI دیده می‌شود، پس اینجا نمی‌توانید آن را تغییر دهید یا حذف کنید.",
            "items": [
              {
                "name": "Summary tab",
                "description": "اطلاعات کلیدی آبجکت در بخش‌های برچسب‌دار (وضعیت، replicas، پورت‌ها، conditions و غیره)، و بعد Labels و Annotations به‌شکل تگ‌های key=value. Label تگی است که برای انتخاب آبجکت‌ها به کار می‌رود؛ Annotation یادداشت آزادی است که ابزارها اضافه می‌کنند."
              },
              {
                "name": "Events tab",
                "description": "رویدادهای اخیر کلاستر دربارهٔ همین آبجکت، از جدید به قدیم (Type، Reason، Object، Namespace، Count، Message، Last seen). روی تب تعداد نشان داده می‌شود. Kubernetes رویدادها را فقط مدت کوتاهی نگه می‌دارد، پس ممکن است خالی باشد."
              },
              {
                "name": "Commands tab",
                "description": "دستورهای آمادهٔ kubectl برای همین آبجکت، هرکدام با دکمه کپی و دکمه اجرا. دکمه Run خروجی را در پنل کناری دیگری نشان می‌دهد. دستورهای دارای برچسب \"writes\" یا \"danger\" پیش از اجرا تأیید می‌گیرند."
              },
              {
                "name": "Manifest tab",
                "description": "کل آبجکت به‌صورت JSON (همان داده‌ای که Kubernetes نگه می‌دارد). موارد اضافی مثل last-applied-configuration حذف شده‌اند. این JSON است و نه YAML."
              },
              {
                "name": "Describe tab",
                "description": "خروجی kubectl describe: یک گزارش خوانا شامل conditions و رویدادهای اخیر. اگر خطا بدهد، پیام \"Describe output unavailable\" را می‌بینید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: رویدادهای اخیر، فقط warningها و رویدادها در همهٔ Namespaceها. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Events table",
            "description": "هر ردیف یک آبجکت است. سلول‌هایی که pill رنگی دارند مقدار وضعیت هستند.",
            "columns": [
              {
                "name": "Type",
                "meaning": "Normal (خاکستری) یا Warning (نارنجی).",
                "example": "Warning"
              },
              {
                "name": "Reason",
                "meaning": "کد کوتاه برای آنچه اتفاق افتاده است.",
                "example": "BackOff, FailedScheduling, Pulled, Killing"
              },
              {
                "name": "Object",
                "meaning": "نوع و نام آبجکت مربوطه.",
                "example": "Pod/shop-api-7c9d8-abcde"
              },
              {
                "name": "Namespace",
                "meaning": "Namespace آبجکت.",
                "example": "shop"
              },
              {
                "name": "Count",
                "meaning": "چند بار رخ داده است.",
                "example": "37 یعنی 37 بار تکرار شده"
              },
              {
                "name": "Message",
                "meaning": "توضیح قابل‌فهم برای انسان (بعد از 180 کاراکتر بریده می‌شود).",
                "example": "Back-off restarting failed container"
              },
              {
                "name": "Age",
                "meaning": "مدت زمانی که از ساخته شدن آبجکت گذشته است.",
                "example": "3d یعنی سه روز پیش ساخته شده؛ 12m یعنی دوازده دقیقه پیش."
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: پیدا کردن دلیل بالا نیامدن یک Pod",
          "steps": [
            "Events را باز کنید و جدیدترین ردیف‌های Warning را بخوانید.",
            "ردیفی مثل \"FailedScheduling, Pod/shop-api-..., 0/3 nodes are available: insufficient memory\" یعنی Pod جایی برای اجرا ندارد.",
            "روی ردیف کلیک کنید تا رویداد کامل را ببینید، و بعد Nodes را برای بررسی ظرفیت باز کنید."
          ]
        },
        "tips": [
          "اگر فهرست خالی است، احتمالاً رویدادها منقضی شده‌اند، نه اینکه چیزی رخ نداده باشد.",
          "Count بالا روی یک Warning معمولاً یعنی حلقه‌ای که مدام شکست می‌خورد."
        ]
      },
      "kubernetes/console": {
        "title": "Kubectl console (کنسول kubectl)",
        "summary": "دستورهای واقعی kubectl را از داخل OpsDeck روی کلاستر انتخاب‌شده اجرا کنید، با اجبار Context و اعمال قوانین ایمنی.",
        "whenToUse": [
          "یک دستور kubectl را می‌دانید و می‌خواهید بدون بیرون رفتن از برنامه سریع اجرایش کنید.",
          "یک نمونهٔ آماده برای شروع می‌خواهید."
        ],
        "howItWorks": [
          "kubectl ابزار خط فرمان استاندارد Kubernetes است. دستوری را که با kubectl شروع می‌شود بنویسید و Run را بزنید. OpsDeck آن را با Context انتخاب‌شده اجرا می‌کند و اگر Namespace را ننوشته باشید، Namespace انتخاب‌شده را خودکار اضافه می‌کند.",
          "دستورها بدون shell میزبان اجرا می‌شوند، پس pipe، redirect و ترفندهای shell کار نمی‌کنند. flagهای streaming (مثل -f)، port-forward، proxy، attach، edit و هر چیزی که kubeconfig را تغییر دهد رد می‌شود. ترمینال Pod دکمه Shell جداگانه‌ای در صفحه Pods دارد.",
          "فقط نتیجهٔ آخرین دستور نمایش داده می‌شود. با کلیدهای جهت‌نما دستورهای قبلی را برگردانید.",
          "داده‌ها زنده و با اجرای دستورهای واقعی kubectl از طریق OpsDeck از کلاستر انتخاب‌شده می‌آیند. چیزی کش یا ساختگی نیست و صفحه خودکار تازه نمی‌شود: برای خواندن دوباره Refresh را بزنید (یا Context، Namespace یا محدوده را عوض کنید).",
          "اگر kubectl نصب نباشد، بنر \"kubectl is not installed\" با لینک نصب و کارت Local tools را می‌بینید؛ اگر هیچ Context در kubeconfig نباشد، پیام \"No kubeconfig context found\" با دکمه Import kubeconfig نمایش داده می‌شود."
        ],
        "parts": [
          {
            "name": "Toolbar (نوار ابزار)",
            "description": "زیر عنوان صفحه قرار دارد و تعیین می‌کند صفحه از کدام کلاستر و Namespace بخواند. در بالا سمت راست صفحه هم دکمه‌های Ask AI و Refresh هست. دکمه Ask AI از دستیار هوشمند درباره همین صفحه و با اطلاعات زندهٔ کلاستر سؤال می‌پرسد. دکمه Refresh دوباره از کلاستر می‌خواند.",
            "items": [
              {
                "name": "Context (کانتکست)",
                "description": "Context یک اتصال ذخیره‌شده به کلاستر در فایل kubeconfig است (مثلاً \"minikube\" یا \"prod-eu\"). با انتخاب Context دیگر، کل محیط Kubernetes به همان کلاستر عوض می‌شود. OpsDeck انتخاب شما را خودش نگه می‌دارد و هرگز فایل ~/.kube/config را تغییر نمی‌دهد."
              },
              {
                "name": "Namespace (فضای نام)",
                "description": "Namespace مثل یک پوشهٔ نام‌دار داخل کلاستر است که آبجکت‌ها را گروه‌بندی می‌کند (مثلاً \"default\"، \"shop\"، \"monitoring\"). این فهرست مشخص می‌کند کدام Namespace نمایش داده شود. وقتی \"All namespaces\" روشن باشد، این فهرست غیرفعال (خاکستری) است."
              },
              {
                "name": "Current namespace / All namespaces button",
                "description": "بین یک Namespace انتخاب‌شده و همهٔ Namespaceها جابه‌جا می‌شود. در حالت همه، به آدرس صفحه \"?all=1\" اضافه می‌شود و جدول آبجکت‌های کل کلاستر را نشان می‌دهد (ستون Name همان است، پس برای فهمیدن Namespace هر ردیف به دکمه‌های ردیف یا پنل کناری نگاه کنید)."
              },
              {
                "name": "Connection badge",
                "description": "نشان سبز \"connected\" یعنی کلاستر پاسخ داده است. نشان نارنجی \"not connected\" یعنی kubectl نتوانسته به آن برسد (VPN خاموش است، کلاستر متوقف شده یا لاگین منقضی شده)."
              },
              {
                "name": "Copy context",
                "description": "یک دستور آمادهٔ kubectl را برای Context انتخاب‌شده کپی می‌کند، مثلاً: kubectl --context minikube get pods -A. آن را در ترمینال خودتان Paste کنید."
              }
            ]
          },
          {
            "name": "Console card",
            "description": "زیرعنوان Context و Namespace فعال را نشان می‌دهد.",
            "items": [
              {
                "name": "Suggestion chips",
                "description": "تا چهار نمونهٔ تک‌کلیکی (مثلاً Pods، All resources، Events، Nodes). chip فقط ورودی را پر می‌کند؛ تا Run را نزنید اجرا نمی‌شود."
              },
              {
                "name": "Command input",
                "description": "پرامپت \"$\" و یک کادر متن با placeholder \"kubectl get pods -o wide\". با Up و Down بین دستورهایی که در این نشست اجرا کرده‌اید حرکت کنید."
              },
              {
                "name": "Run",
                "description": "دستور را اجرا می‌کند. هنگام انتظار دکمه \"Running...\" نشان می‌دهد. دستور ناموفق یک toast خطا هم نشان می‌دهد."
              },
              {
                "name": "Clear",
                "description": "ناحیهٔ خروجی را به \"Console cleared\" بازنشانی می‌کند."
              },
              {
                "name": "Output entry",
                "description": "دستور کامل، یک نشان exit (سبز \"exit 0\" برای موفقیت، قرمز \"exit 1\" یا \"timed out\" برای شکست) و متن خروجی را نشان می‌دهد. آیکون expand خروجی را تمام‌صفحه در پنل کناری باز می‌کند، جایی که Copy output هم هست."
              },
              {
                "name": "Empty state",
                "description": "\"No commands yet\": یک دستور بنویسید یا یکی از پیشنهادها را انتخاب کنید."
              }
            ]
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: pods، همهٔ resourceها، events و nodes، به‌علاوهٔ دستورهای فقط-کپی برای describe یک Pod یا خواندن لاگ آن (POD را با نام واقعی یک Pod جایگزین کنید). هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          }
        ],
        "tables": [
          {
            "name": "Safe command examples",
            "description": "در برنامه جدول نیست؛ نمونه‌هایی از چیزهایی است که می‌توانید تایپ کنید.",
            "columns": [
              {
                "name": "kubectl get pods -o wide",
                "meaning": "Podها را همراه با node و IP در Namespace انتخاب‌شده فهرست می‌کند.",
                "example": "خروجی ستون‌های NAME READY STATUS RESTARTS AGE IP NODE دارد"
              },
              {
                "name": "kubectl get events --sort-by=.lastTimestamp",
                "meaning": "جدیدترین رویدادها در آخر.",
                "example": "خط‌های BackOff یا FailedScheduling را نشان می‌دهد"
              },
              {
                "name": "kubectl describe pod shop-api-1",
                "meaning": "گزارش مفصل دربارهٔ یک Pod.",
                "example": "با بخش Events تمام می‌شود"
              }
            ]
          }
        ],
        "example": {
          "title": "مثال: فهرست Podها و خواندن لاگ یکی از آن‌ها",
          "steps": [
            "Kubectl console را باز کنید، روی chip پیشنهادی \"Pods\" کلیک و Run را بزنید.",
            "نام یک Pod را از خروجی کپی کنید.",
            "\"kubectl logs shop-api-1 --tail=50\" را تایپ و Run را بزنید؛ exit 0 سبز یعنی لاگ‌ها نمایش داده شده‌اند.",
            "کلید Up را بزنید تا دستور قبلی را برگردانید و ویرایش کنید."
          ]
        },
        "tips": [
          "دستورهای تغییردهنده مثل delete یا scale واقعاً کار می‌کنند، پس پیش از زدن Run دوباره بررسی کنید.",
          "دستورهای تعاملی یا streaming (مثل logs -f و exec -it) رد می‌شوند؛ به‌جای آن‌ها از دکمه‌های Logs و Shell در Pod استفاده کنید."
        ]
      },
      "kubernetes/tools": {
        "title": "Local tools (ابزارهای محلی)",
        "summary": "نشان می‌دهد OpsDeck برای Kubernetes به کدام ابزارهای خط فرمان نیاز دارد (kubectl، kind، Minikube، Helm)، ابزارهای نصب‌نشده را نصب می‌کند و یک کلاستر محلی Minikube را کنترل می‌کند.",
        "whenToUse": [
          "صفحه‌های Kubernetes می‌گویند kubectl نصب نیست.",
          "Helm را می‌خواهید تا صفحه Helm releases کار کند.",
          "می‌خواهید یک کلاستر محلی Minikube را راه‌اندازی یا متوقف کنید."
        ],
        "howItWorks": [
          "OpsDeck هر ابزار را در PATH شما و در فضای ذخیرهٔ خودش جست‌وجو می‌کند و نسخهٔ واقعی را از خود فایل‌های اجرایی می‌خواند.",
          "Install missing tools نسخه‌های رسمی را در فضای ذخیرهٔ برنامهٔ OpsDeck دانلود می‌کند. به sudo نیاز ندارد، تغییری در سیستم نمی‌دهد و دانلودها را با checksum بررسی می‌کند.",
          "صفحه هنگام باز شدن یک بار می‌خواند؛ برای بررسی دوباره Refresh را بزنید."
        ],
        "parts": [
          {
            "name": "Local tools card",
            "description": "یک ردیف برای هر ابزار: kubectl (با برچسب \"required\")، kind، minikube و Helm.",
            "items": [
              {
                "name": "Version badge",
                "description": "اگر نصب باشد سبز و همراه نسخه، وگرنه قرمز \"not installed\" با یک توضیح کوتاه."
              },
              {
                "name": "Install missing tools",
                "description": "تعداد ابزارهای نصب‌نشده را نشان می‌دهد و همه را نصب می‌کند. هر ابزار یک نوار پیشرفت و پیام دارد؛ در این مدت دکمه \"Installing...\" می‌نویسد. یک toast موفقیت فهرست نصب‌شده‌ها را نشان می‌دهد."
              }
            ]
          },
          {
            "name": "Minikube card",
            "description": "Minikube ابزاری است که یک کلاستر کوچک Kubernetes را روی کامپیوتر خودتان اجرا می‌کند. نام profile و یک نشان (running سبز، stopped نارنجی، no profile، not installed) را نشان می‌دهد. Start Minikube (اصلی) یا Stop Minikube (قرمز) تأیید می‌گیرد و فقط minikube start یا minikube stop را اجرا می‌کند. اگر Minikube نصب نباشد، دکمه غیرفعال است."
          },
          {
            "name": "Managed installs card",
            "description": "ابزارهایی را فهرست می‌کند که خود OpsDeck نصب کرده، همراه نسخه، مدت زمان گذشته و نشان سبز \"managed\". زیرعنوان پوشهٔ ذخیره‌سازی را نشان می‌دهد. پیام خالی: \"No managed installs yet\"."
          },
          {
            "name": "Ready-made kubectl commands (دستورهای آماده)",
            "description": "کارتی جمع‌شونده زیر جدول که بر اساس Context و Namespace انتخاب‌شده ساخته می‌شود. نمونه‌ها: kubectl version، kind clusters، وضعیت Minikube و Helm version. همه فقط-کپی هستند و در ترمینال خودتان اجرا می‌شوند. هر مورد دکمه کپی دارد و، اگر اجرای آن داخل OpsDeck امن باشد، دکمه پخش که آن را اجرا و خروجی را نمایش می‌دهد. موردهای \"copy only\" را باید در ترمینال خودتان اجرا کنید؛ نشان‌های \"write\" و \"danger\" یعنی دستور کلاستر را تغییر می‌دهد و OpsDeck پیش از اجرا تأیید می‌گیرد."
          },
          {
            "name": "What OpsDeck will not touch",
            "description": "یادآوری: OpsDeck هرگز ~/.kube/config را ویرایش نمی‌کند، هرگز در پوشه‌های سیستمی نمی‌نویسد، هرگز sudo نمی‌خواهد و هر دستور آرگومان صریح context دارد."
          }
        ],
        "example": {
          "title": "مثال: راه‌اندازی ابزارهای Kubernetes از صفر",
          "steps": [
            "Local tools را باز کنید و ببینید کدام ردیف‌ها قرمزند.",
            "\"Install missing tools\" را بزنید و صبر کنید هر نوار پیشرفت کامل شود.",
            "کارت Minikube را باز کنید و Start Minikube را بزنید (تأیید کنید). ممکن است یک دقیقه طول بکشد.",
            "Cluster overview را باز کنید؛ نشان نوار ابزار باید \"connected\" را نشان دهد."
          ]
        },
        "tips": [
          "kubectl تنها ابزار الزامی است؛ kind، Minikube و Helm اختیاری‌اند.",
          "نسخه‌های نصب‌شده در فضای ذخیرهٔ OpsDeck هستند و جایگزین نسخه‌های سیستمی نمی‌شوند."
        ]
      }
    });
})();
