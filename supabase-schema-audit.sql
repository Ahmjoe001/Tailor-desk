        -- Read-only TailorDesk audit. Run the entire file as one query in Supabase SQL Editor.
        -- The query returns one result table with check_name, status, and details columns.
        -- All database data checks use SELECT statements. Nothing is changed.
        WITH
        requested_tables(table_name) AS (
            VALUES
                ('profiles'),
                ('customers'),
                ('measurements'),
                ('customer_measurement_sets'),
                ('orders'),
                ('payments'),
                ('fashion_catalogue'),
                ('customer_measurement_set_history'),
                ('business_expenses'),
                ('inventory_items')
        ),
        table_catalog AS (
            SELECT
                requested.table_name,
                table_info.oid AS table_oid,
                table_info.relrowsecurity AS rls_enabled,
                table_info.relforcerowsecurity AS rls_forced,
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'column', column_info.column_name,
                            'type', column_info.data_type,
                            'database_type', column_info.udt_name,
                            'nullable', column_info.is_nullable,
                            'default', column_info.column_default
                        )
                        ORDER BY column_info.ordinal_position
                    ) FILTER (WHERE column_info.column_name IS NOT NULL),
                    '[]'::jsonb
                ) AS columns
            FROM requested_tables AS requested
            LEFT JOIN pg_namespace AS schema_info
                ON schema_info.nspname = 'public'
            LEFT JOIN pg_class AS table_info
                ON table_info.relnamespace = schema_info.oid
                AND table_info.relname = requested.table_name
                AND table_info.relkind IN ('r', 'p')
            LEFT JOIN information_schema.columns AS column_info
                ON column_info.table_schema = 'public'
                AND column_info.table_name = requested.table_name
            GROUP BY requested.table_name, table_info.oid,
                table_info.relrowsecurity, table_info.relforcerowsecurity
        ),
        constraint_rows AS (
            SELECT
                source_table.relname AS table_name,
                constraint_info.conname AS constraint_name,
                CASE constraint_info.contype
                    WHEN 'p' THEN 'primary key'
                    WHEN 'f' THEN 'foreign key'
                    WHEN 'u' THEN 'unique'
                    WHEN 'c' THEN 'check'
                    WHEN 'x' THEN 'exclusion'
                    ELSE constraint_info.contype::text
                END AS constraint_type,
                jsonb_build_object(
                    'constraint', constraint_info.conname,
                    'type', CASE constraint_info.contype
                        WHEN 'p' THEN 'primary key'
                        WHEN 'f' THEN 'foreign key'
                        WHEN 'u' THEN 'unique'
                        WHEN 'c' THEN 'check'
                        WHEN 'x' THEN 'exclusion'
                        ELSE constraint_info.contype::text
                    END,
                    'validated', constraint_info.convalidated,
                    'deferrable', constraint_info.condeferrable,
                    'referenced_schema', target_schema.nspname,
                    'referenced_table', target_table.relname,
                    'definition', pg_get_constraintdef(constraint_info.oid, true)
                ) AS details
            FROM pg_constraint AS constraint_info
            JOIN pg_class AS source_table
                ON source_table.oid = constraint_info.conrelid
            JOIN pg_namespace AS source_schema
                ON source_schema.oid = source_table.relnamespace
            LEFT JOIN pg_class AS target_table
                ON target_table.oid = constraint_info.confrelid
            LEFT JOIN pg_namespace AS target_schema
                ON target_schema.oid = target_table.relnamespace
            WHERE source_schema.nspname = 'public'
                AND source_table.relname IN (
                    'profiles', 'customers', 'measurements',
                    'customer_measurement_sets', 'orders', 'payments',
                    'fashion_catalogue', 'customer_measurement_set_history',
                    'business_expenses', 'inventory_items'
                )
        ),
        expected_functions(function_name) AS (
            VALUES
                ('record_payment'),
                ('ensure_tailor_profile'),
                ('handle_new_user_profile'),
                ('get_my_tailor_profile'),
                ('update_my_tailor_profile')
        ),
        function_rows AS (
            SELECT
                procedure.oid,
                procedure.proname AS function_name,
                pg_get_function_identity_arguments(procedure.oid) AS argument_types,
                pg_get_function_arguments(procedure.oid) AS arguments_with_defaults,
                pg_get_function_result(procedure.oid) AS return_type,
                pg_get_userbyid(procedure.proowner) AS owner,
                procedure.prosecdef AS security_definer,
                procedure.proconfig AS function_settings,
                procedure.proacl AS raw_execute_acl,
                pg_get_functiondef(procedure.oid) AS function_definition
            FROM pg_proc AS procedure
            JOIN pg_namespace AS function_schema
                ON function_schema.oid = procedure.pronamespace
            WHERE function_schema.nspname = 'public'
                AND procedure.proname IN (
                    'record_payment',
                    'ensure_tailor_profile',
                    'handle_new_user_profile',
                    'get_my_tailor_profile',
                    'update_my_tailor_profile'
                )
        ),
        profile_trigger_rows AS (
            SELECT
                trigger_info.tgname AS trigger_name,
                trigger_info.tgenabled AS enabled_state,
                pg_get_triggerdef(trigger_info.oid, true) AS trigger_definition,
                function_schema.nspname AS function_schema,
                trigger_function.proname AS function_name,
                pg_get_userbyid(trigger_function.proowner) AS function_owner,
                trigger_function.prosecdef AS security_definer,
                trigger_function.proconfig AS function_settings,
                pg_get_functiondef(trigger_function.oid) AS function_definition
            FROM pg_trigger AS trigger_info
            JOIN pg_class AS auth_table
                ON auth_table.oid = trigger_info.tgrelid
            JOIN pg_namespace AS auth_schema
                ON auth_schema.oid = auth_table.relnamespace
            JOIN pg_proc AS trigger_function
                ON trigger_function.oid = trigger_info.tgfoid
            JOIN pg_namespace AS function_schema
                ON function_schema.oid = trigger_function.pronamespace
            WHERE auth_schema.nspname = 'auth'
                AND auth_table.relname = 'users'
                AND trigger_info.tgname = 'on_auth_user_created_profile'
                AND NOT trigger_info.tgisinternal
        ),
        ownership_specs(check_name, source_table, linked_table, required_columns, linked_columns, query_template) AS (
            VALUES
                (
                    'Customer tailor IDs reference profiles',
                    'customers',
                    'profiles',
                    ARRAY['tailor_id']::text[],
                    ARRAY['id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.customers AS customer LEFT JOIN public.profiles AS profile ON profile.id = customer.tailor_id WHERE profile.id IS NULL'
                ),
                (
                    'Measurements belong to their customer''s tailor',
                    'measurements',
                    'customers',
                    ARRAY['tailor_id', 'customer_id']::text[],
                    ARRAY['id', 'tailor_id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.measurements AS measurement LEFT JOIN public.customers AS linked_customer ON linked_customer.id = measurement.customer_id WHERE linked_customer.id IS NULL OR linked_customer.tailor_id IS DISTINCT FROM measurement.tailor_id'
                ),
                (
                    'Measurement sets belong to their customer''s tailor',
                    'customer_measurement_sets',
                    'customers',
                    ARRAY['tailor_id', 'customer_id']::text[],
                    ARRAY['id', 'tailor_id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.customer_measurement_sets AS measurement_set LEFT JOIN public.customers AS linked_customer ON linked_customer.id = measurement_set.customer_id WHERE linked_customer.id IS NULL OR linked_customer.tailor_id IS DISTINCT FROM measurement_set.tailor_id'
                ),
                (
                    'Orders belong to their customer''s tailor',
                    'orders',
                    'customers',
                    ARRAY['tailor_id', 'customer_id']::text[],
                    ARRAY['id', 'tailor_id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.orders AS order_record LEFT JOIN public.customers AS linked_customer ON linked_customer.id = order_record.customer_id WHERE linked_customer.id IS NULL OR linked_customer.tailor_id IS DISTINCT FROM order_record.tailor_id'
                ),
                (
                    'Payments belong to their order''s tailor and customer',
                    'payments',
                    'orders',
                    ARRAY['tailor_id', 'order_id']::text[],
                    ARRAY['id', 'tailor_id', 'customer_id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.payments AS payment LEFT JOIN public.orders AS linked_order ON linked_order.id = payment.order_id WHERE linked_order.id IS NULL OR linked_order.tailor_id IS DISTINCT FROM payment.tailor_id OR (to_jsonb(payment) ->> ''customer_id'' IS NOT NULL AND to_jsonb(payment) ->> ''customer_id'' IS DISTINCT FROM linked_order.customer_id::text)'
                ),
                (
                    'Catalogue designs belong to their tailor',
                    'fashion_catalogue',
                    'profiles',
                    ARRAY['tailor_id']::text[],
                    ARRAY['id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.fashion_catalogue AS design LEFT JOIN public.profiles AS profile ON profile.id = design.tailor_id WHERE profile.id IS NULL'
                ),
                (
                    'Measurement history belongs to its customer''s tailor',
                    'customer_measurement_set_history',
                    'customers',
                    ARRAY['tailor_id', 'customer_id']::text[],
                    ARRAY['id', 'tailor_id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.customer_measurement_set_history AS history LEFT JOIN public.customers AS linked_customer ON linked_customer.id = history.customer_id WHERE linked_customer.id IS NULL OR linked_customer.tailor_id IS DISTINCT FROM history.tailor_id'
                ),
                (
                    'Expenses belong to their tailor',
                    'business_expenses',
                    'profiles',
                    ARRAY['tailor_id']::text[],
                    ARRAY['id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.business_expenses AS expense LEFT JOIN public.profiles AS profile ON profile.id = expense.tailor_id WHERE profile.id IS NULL'
                ),
                (
                    'Inventory belongs to its tailor',
                    'inventory_items',
                    'profiles',
                    ARRAY['tailor_id']::text[],
                    ARRAY['id']::text[],
                    'SELECT COUNT(*) AS finding_count FROM public.inventory_items AS item LEFT JOIN public.profiles AS profile ON profile.id = item.tailor_id WHERE profile.id IS NULL'
                )
        ),
        ownership_queries AS (
            SELECT
                ownership.check_name,
                ownership.source_table,
                ownership.linked_table,
                ownership.query_template,
                table_catalog.table_oid IS NOT NULL
                    AND NOT EXISTS (
                        SELECT 1
                        FROM unnest(ownership.required_columns) AS required(column_name)
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns AS column_info
                            WHERE column_info.table_schema = 'public'
                                AND column_info.table_name = ownership.source_table
                                AND column_info.column_name = required.column_name
                        )
                    ) AS schema_available,
                linked_catalog.table_oid IS NOT NULL
                    AND NOT EXISTS (
                        SELECT 1
                        FROM unnest(ownership.linked_columns) AS required(column_name)
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns AS column_info
                            WHERE column_info.table_schema = 'public'
                                AND column_info.table_name = ownership.linked_table
                                AND column_info.column_name = required.column_name
                        )
                    ) AS linked_schema_available,
                CASE
                    WHEN table_catalog.table_oid IS NOT NULL
                        THEN has_table_privilege(current_user, table_catalog.table_oid, 'SELECT')
                    ELSE false
                END AS source_readable,
                CASE
                    WHEN linked_catalog.table_oid IS NOT NULL
                        THEN has_table_privilege(current_user, linked_catalog.table_oid, 'SELECT')
                    ELSE false
                END AS linked_readable
            FROM ownership_specs AS ownership
            JOIN table_catalog
                ON table_catalog.table_name = ownership.source_table
            JOIN table_catalog AS linked_catalog
                ON linked_catalog.table_name = ownership.linked_table
        ),
        payment_total_query AS (
            SELECT
                EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'orders'
                        AND column_name IN ('id', 'amount_paid', 'total_amount')
                    GROUP BY table_name
                    HAVING COUNT(*) = 3
                )
                AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'payments'
                        AND column_name IN ('order_id', 'amount')
                    GROUP BY table_name
                    HAVING COUNT(*) = 2
                ) AS schema_available,
                COALESCE((
                    SELECT has_table_privilege(current_user, table_oid, 'SELECT')
                    FROM table_catalog
                    WHERE table_name = 'orders'
                ), false) AS orders_readable,
                COALESCE((
                    SELECT has_table_privilege(current_user, table_oid, 'SELECT')
                    FROM table_catalog
                    WHERE table_name = 'payments'
                ), false) AS payments_readable
        ),
        audit_rows(check_name, status, details) AS (
            -- One row per expected application table, with all present columns.
            SELECT
                'Table and columns: public.' || table_name,
                CASE WHEN table_oid IS NULL THEN 'MISSING' ELSE 'FOUND' END,
                CASE
                    WHEN table_oid IS NULL THEN 'Table is missing.'
                    ELSE 'Columns: ' || columns::text
                END
            FROM table_catalog

            UNION ALL

            -- Keys, foreign keys, and constraints; explicitly report a table with none.
            SELECT
                'Constraints: public.' || table_catalog.table_name,
                CASE
                    WHEN table_catalog.table_oid IS NULL THEN 'MISSING TABLE'
                    WHEN constraint_rows.constraint_name IS NULL THEN 'NONE FOUND'
                    ELSE 'FOUND'
                END,
                CASE
                    WHEN table_catalog.table_oid IS NULL THEN 'Constraint check unavailable because the table is missing.'
                    WHEN constraint_rows.constraint_name IS NULL THEN 'No primary key, foreign key, unique, check, or exclusion constraints were found.'
                    ELSE constraint_rows.details::text
                END
            FROM table_catalog
            LEFT JOIN constraint_rows
                ON constraint_rows.table_name = table_catalog.table_name

            UNION ALL

            -- RLS state for every requested table.
            SELECT
                'Row-level security: public.' || table_name,
                CASE
                    WHEN table_oid IS NULL THEN 'MISSING TABLE'
                    WHEN rls_enabled THEN 'ENABLED'
                    ELSE 'DISABLED'
                END,
                CASE
                    WHEN table_oid IS NULL THEN 'RLS state cannot be checked because the table is missing.'
                    ELSE 'RLS enabled=' || rls_enabled::text || '; forced=' || rls_forced::text
                END
            FROM table_catalog

            UNION ALL

            -- Existing policies and definitions, including image-object policies.
            SELECT
                'Policy: ' || policy.schemaname || '.' || policy.tablename || '.' || policy.policyname,
                'FOUND',
                jsonb_build_object(
                    'permissive', policy.permissive,
                    'roles', policy.roles,
                    'command', policy.cmd,
                    'using', policy.qual,
                    'with_check', policy.with_check
                )::text
            FROM pg_policies AS policy
            WHERE (policy.schemaname = 'public' AND policy.tablename IN (
                    'profiles', 'customers', 'measurements',
                    'customer_measurement_sets', 'orders', 'payments',
                    'fashion_catalogue', 'customer_measurement_set_history',
                    'business_expenses', 'inventory_items'
                ))
                OR (policy.schemaname = 'storage' AND policy.tablename = 'objects')

            UNION ALL

            SELECT
                'Policies: storage.objects',
                CASE
                    WHEN to_regclass('storage.objects') IS NULL THEN 'UNAVAILABLE'
                    WHEN EXISTS (
                        SELECT 1 FROM pg_policies AS policy
                        WHERE policy.schemaname = 'storage'
                            AND policy.tablename = 'objects'
                    ) THEN 'FOUND'
                    ELSE 'NONE FOUND'
                END,
                'Individual storage.objects Policy rows above show the policy commands and expressions.'

            UNION ALL

            SELECT
                'Policies: public.' || table_catalog.table_name,
                CASE
                    WHEN table_catalog.table_oid IS NULL THEN 'MISSING TABLE'
                    WHEN EXISTS (
                        SELECT 1 FROM pg_policies AS policy
                        WHERE policy.schemaname = 'public'
                            AND policy.tablename = table_catalog.table_name
                    ) THEN 'FOUND'
                    ELSE 'NONE FOUND'
                END,
                'Use the individual Policy rows for definitions; RLS state is reported separately.'
            FROM table_catalog

            UNION ALL

            -- Table grants clarify SQL privileges; policies are still the row boundary.
            SELECT
                'Table privilege: ' || grant_info.table_schema || '.' || grant_info.table_name,
                'FOUND',
                jsonb_build_object(
                    'grantee', grant_info.grantee,
                    'privilege', grant_info.privilege_type,
                    'grantable', grant_info.is_grantable
                )::text
            FROM information_schema.role_table_grants AS grant_info
            WHERE grant_info.table_schema = 'public'
                AND grant_info.table_name IN (
                    'profiles', 'customers', 'measurements',
                    'customer_measurement_sets', 'orders', 'payments',
                    'fashion_catalogue', 'customer_measurement_set_history',
                    'business_expenses', 'inventory_items'
                )

            UNION ALL

            -- Function signatures, bodies, security mode, and execution permissions.
            SELECT
                'Function: public.' || function_rows.function_name || '(' || function_rows.argument_types || ')',
                'FOUND',
                jsonb_build_object(
                    'arguments_with_defaults', function_rows.arguments_with_defaults,
                    'return_type', function_rows.return_type,
                    'owner', function_rows.owner,
                    'security_definer', function_rows.security_definer,
                    'settings', function_rows.function_settings,
                    'raw_execute_acl', function_rows.raw_execute_acl,
                    'anon_can_execute', CASE
                        WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
                        THEN has_function_privilege('anon', function_rows.oid, 'EXECUTE')
                        ELSE NULL
                    END,
                    'authenticated_can_execute', CASE
                        WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
                        THEN has_function_privilege('authenticated', function_rows.oid, 'EXECUTE')
                        ELSE NULL
                    END,
                    'definition', function_rows.function_definition
                )::text
            FROM function_rows

            UNION ALL

            SELECT
                'Function: public.' || expected.function_name,
                'MISSING',
                'No matching function was found in the public schema.'
            FROM expected_functions AS expected
            WHERE NOT EXISTS (
                SELECT 1 FROM function_rows
                WHERE function_rows.function_name = expected.function_name
            )

            UNION ALL

            -- Profile-creation trigger, with a missing result instead of an empty result set.
            SELECT
                'Profile creation trigger: auth.users',
                CASE WHEN trigger_name IS NULL THEN 'MISSING' ELSE 'FOUND' END,
                CASE
                    WHEN trigger_name IS NULL THEN 'Trigger on_auth_user_created_profile was not found or is not visible to this role.'
                    ELSE jsonb_build_object(
                        'trigger', trigger_name,
                        'enabled_state', enabled_state,
                        'definition', trigger_definition,
                        'function_schema', function_schema,
                        'function', function_name,
                        'function_owner', function_owner,
                        'security_definer', security_definer,
                        'settings', function_settings,
                        'function_definition', function_definition
                    )::text
                END
            FROM (SELECT 1 AS marker) AS singleton
            LEFT JOIN profile_trigger_rows ON true

            UNION ALL

            -- Dynamic, read-only ownership checks allow missing tables/columns to be reported.
            SELECT
                ownership.check_name,
                CASE
                    WHEN NOT ownership.schema_available THEN 'MISSING TABLE OR COLUMN'
                    WHEN NOT ownership.linked_schema_available THEN 'MISSING LINKED TABLE OR COLUMN'
                    WHEN NOT ownership.source_readable OR NOT ownership.linked_readable THEN 'NOT ACCESSIBLE'
                    WHEN findings.finding_count = 0 THEN 'NO PROBLEMS FOUND'
                    ELSE 'PROBLEMS FOUND'
                END,
                CASE
                    WHEN NOT ownership.schema_available THEN
                        'Required table public.' || ownership.source_table || ' or one of its ownership columns is missing.'
                    WHEN NOT ownership.linked_schema_available THEN
                        'Required linked-table columns are missing; this ownership check was skipped.'
                    WHEN NOT ownership.source_readable OR NOT ownership.linked_readable THEN
                        'The current SQL Editor role cannot read one or both tables; this ownership check was skipped.'
                    ELSE 'Rows with invalid or cross-tailor links: ' || findings.finding_count::text
                END
            FROM ownership_queries AS ownership
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN ownership.schema_available
                            AND ownership.linked_schema_available
                            AND ownership.source_readable
                            AND ownership.linked_readable
                        THEN (
                            xpath(
                                '/table/row/finding_count/text()',
                                query_to_xml(ownership.query_template, true, false, '')
                            )
                        )[1]::text::bigint
                        ELSE NULL
                    END AS finding_count
            ) AS findings ON true

            UNION ALL

            -- Compare total payments with each order's amount_paid and report the balance formula.
            SELECT
                'Payment totals compared with orders.amount_paid',
                CASE
                    WHEN NOT payment_total_query.schema_available THEN 'MISSING TABLE OR COLUMN'
                    WHEN NOT payment_total_query.orders_readable OR NOT payment_total_query.payments_readable THEN 'NOT ACCESSIBLE'
                    WHEN payment_results.mismatched_orders = 0 THEN 'NO DIFFERENCES FOUND'
                    ELSE 'DIFFERENCES FOUND'
                END,
                CASE
                    WHEN NOT payment_total_query.schema_available THEN
                        'Required orders (id, total_amount, amount_paid) and payments (order_id, amount) columns were not all found; comparison skipped.'
                    WHEN NOT payment_total_query.orders_readable OR NOT payment_total_query.payments_readable THEN
                        'The current SQL Editor role cannot read orders or payments; comparison skipped.'
                    ELSE
                        'Orders where amount_paid differs from summed payment rows: '
                        || payment_results.mismatched_orders::text
                        || '; Outstanding balance is total_amount - amount_paid. '
                        || 'Orders with a negative calculated balance: '
                        || payment_results.negative_balances::text
                END
            FROM payment_total_query
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN payment_total_query.schema_available
                            AND payment_total_query.orders_readable
                            AND payment_total_query.payments_readable THEN
                            (xpath(
                                '/table/row/mismatched_orders/text()',
                                query_to_xml(
                                    'SELECT '
                                    || 'COUNT(*) FILTER (WHERE ROUND(COALESCE(order_record.amount_paid, 0)::numeric, 2) '
                                    || 'IS DISTINCT FROM ROUND(COALESCE(payment_totals.payment_total, 0)::numeric, 2)) AS mismatched_orders, '
                                    || 'COUNT(*) FILTER (WHERE COALESCE(order_record.total_amount, 0)::numeric '
                                    || '- COALESCE(order_record.amount_paid, 0)::numeric < 0) AS negative_balances '
                                    || 'FROM public.orders AS order_record '
                                    || 'LEFT JOIN (SELECT order_id, SUM(amount) AS payment_total '
                                    || 'FROM public.payments GROUP BY order_id) AS payment_totals '
                                    || 'ON payment_totals.order_id = order_record.id',
                                    true, false, ''
                                )
                            ))[1]::text::bigint
                        ELSE NULL
                    END AS mismatched_orders,
                    CASE
                        WHEN payment_total_query.schema_available
                            AND payment_total_query.orders_readable
                            AND payment_total_query.payments_readable THEN
                            (xpath(
                                '/table/row/negative_balances/text()',
                                query_to_xml(
                                    'SELECT '
                                    || 'COUNT(*) FILTER (WHERE ROUND(COALESCE(order_record.amount_paid, 0)::numeric, 2) '
                                    || 'IS DISTINCT FROM ROUND(COALESCE(payment_totals.payment_total, 0)::numeric, 2)) AS mismatched_orders, '
                                    || 'COUNT(*) FILTER (WHERE COALESCE(order_record.total_amount, 0)::numeric '
                                    || '- COALESCE(order_record.amount_paid, 0)::numeric < 0) AS negative_balances '
                                    || 'FROM public.orders AS order_record '
                                    || 'LEFT JOIN (SELECT order_id, SUM(amount) AS payment_total '
                                    || 'FROM public.payments GROUP BY order_id) AS payment_totals '
                                    || 'ON payment_totals.order_id = order_record.id',
                                    true, false, ''
                                )
                            ))[1]::text::bigint
                        ELSE NULL
                    END AS negative_balances
            ) AS payment_results ON true

            UNION ALL

            -- Optional storage objects are checked from catalogs; bucket contents are read dynamically.
            SELECT
                'Storage bucket: tailordesk-order-images',
                CASE
                    WHEN to_regclass('storage.buckets') IS NULL THEN 'UNAVAILABLE'
                    WHEN NOT has_table_privilege(current_user, 'storage.buckets', 'SELECT') THEN 'NOT ACCESSIBLE'
                    WHEN bucket_result.bucket_exists THEN 'FOUND'
                    ELSE 'MISSING'
                END,
                CASE
                    WHEN to_regclass('storage.buckets') IS NULL THEN
                        'storage.buckets is missing or not visible to this role.'
                    WHEN NOT has_table_privilege(current_user, 'storage.buckets', 'SELECT') THEN
                        'The current SQL Editor role cannot read storage.buckets.'
                    WHEN bucket_result.bucket_exists THEN bucket_result.bucket_details
                    ELSE 'Bucket tailordesk-order-images was not found.'
                END
            FROM (SELECT 1 AS marker) AS singleton
            LEFT JOIN LATERAL (
                SELECT
                    (xpath(
                        '/table/row/bucket_exists/text()',
                        bucket_query.bucket_xml
                    ))[1]::text::boolean AS bucket_exists,
                    (xpath(
                        '/table/row/bucket_details/text()',
                        bucket_query.bucket_xml
                    ))[1]::text AS bucket_details
                FROM (
                    SELECT CASE
                        WHEN to_regclass('storage.buckets') IS NOT NULL
                            AND has_table_privilege(current_user, 'storage.buckets', 'SELECT')
                        THEN query_to_xml(
                            'SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = '
                            || quote_literal('tailordesk-order-images')
                            || ') AS bucket_exists, '
                            || 'COALESCE((SELECT jsonb_build_object(''id'', id, ''name'', name, ''public'', public, '
                            || '''file_size_limit'', file_size_limit, ''allowed_mime_types'', allowed_mime_types)::text '
                            || 'FROM storage.buckets WHERE id = '
                            || quote_literal('tailordesk-order-images')
                            || '), ''{}'') AS bucket_details',
                            true, false, ''
                        )
                        ELSE NULL::xml
                    END AS bucket_xml
                ) AS bucket_query
                WHERE bucket_query.bucket_xml IS NOT NULL
            ) AS bucket_result ON true
        )
        SELECT check_name, status, details
        FROM audit_rows
        ORDER BY check_name, status, details;
