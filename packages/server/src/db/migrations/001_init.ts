import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // users
  await knex.schema.createTable('users', (t) => {
    t.string('id', 64).primary();
    t.integer('uid').unsigned().unique().notNullable();
    t.string('phone', 20).unique();
    t.string('password_hash', 255).notNullable();
    t.string('nickname', 64).notNullable();
    t.string('avatar_url', 255).defaultTo('');
    t.json('user_type').defaultTo('["player"]');
    t.tinyint('creator_level').defaultTo(1);
    t.bigint('coins').unsigned().defaultTo(0);
    t.enu('subscription_type', ['free', 'pro', 'creator']).defaultTo('free');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // campaigns
  await knex.schema.createTable('campaigns', (t) => {
    t.string('id', 64).primary();
    t.string('room_code', 8).unique().notNullable();
    t.string('name', 128).notNullable();
    t.string('ruleset_id', 64).notNullable();
    t.string('module_id', 64).nullable();
    t.string('gm_user_id', 64).notNullable();
    t.json('assistant_gm_ids').defaultTo('[]');
    t.json('global_story_time').defaultTo('{"day":1,"hour":8,"minute":0}');
    t.enu('status', ['preparing', 'running', 'paused', 'ended']).defaultTo('preparing');
    t.boolean('allow_ob').defaultTo(false);
    t.boolean('is_listed_publicly').defaultTo(false);
    t.boolean('enable_trajectory_matrix').defaultTo(false);
    t.boolean('enable_grid_map').defaultTo(false);
    t.boolean('enable_scene_connections').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // scenes
  await knex.schema.createTable('scenes', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('name', 128).notNullable();
    t.enu('type', ['spatial', 'virtual', 'lobby']).notNullable();
    t.enu('history_visibility', ['none', 'recent', 'all']).defaultTo('none');
    t.integer('visible_history_count').defaultTo(50);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // character_sheets
  await knex.schema.createTable('character_sheets', (t) => {
    t.string('id', 64).primary();
    t.string('character_code', 8).unique().notNullable();
    t.string('user_id', 64).notNullable();
    t.string('ruleset_id', 64).notNullable();
    t.string('name', 64).notNullable();
    t.string('occupation_id', 64).nullable();
    t.string('avatar_url', 255).defaultTo('');
    t.json('attributes').defaultTo('{}');
    t.json('skills').defaultTo('{}');
    t.json('derived_max').defaultTo('{}');
    t.json('equipment').defaultTo('[]');
    t.text('background');
    t.json('avatar_custom_data').nullable();
    t.json('initial_snapshot').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // character_scene_states
  await knex.schema.createTable('character_scene_states', (t) => {
    t.string('id', 64).primary();
    t.string('character_id', 64).notNullable();
    t.string('campaign_id', 64).notNullable();
    t.string('current_spatial_scene_id', 64).nullable();
    t.json('personal_story_time').defaultTo('{"day":1,"hour":8,"minute":0}');
    t.unique(['character_id', 'campaign_id']);
  });

  // scene_participations
  await knex.schema.createTable('scene_participations', (t) => {
    t.string('id', 64).primary();
    t.string('scene_id', 64).notNullable();
    t.string('character_id', 64).notNullable();
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.timestamp('left_at').nullable();
  });

  // scheduled_moves
  await knex.schema.createTable('scheduled_moves', (t) => {
    t.string('id', 64).primary();
    t.string('character_id', 64).notNullable();
    t.string('campaign_id', 64).notNullable();
    t.string('to_scene_id', 64).notNullable();
    t.json('execute_at_story').notNullable();
    t.enu('status', ['pending', 'approved', 'executed', 'cancelled']).defaultTo('pending');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // chat_messages
  await knex.schema.createTable('chat_messages', (t) => {
    t.bigInteger('id').unsigned().primary();  // snowflake
    t.string('scene_id', 64).notNullable();
    t.string('campaign_id', 64).notNullable();
    t.string('sender_user_id', 64).notNullable();
    t.string('sender_character_id', 64).nullable();
    t.text('content').notNullable();
    t.enu('message_type', ['narrative', 'dice', 'ooc', 'system', 'announcement', 'clue_card']).notNullable();
    t.json('story_time').nullable();
    t.json('visible_to').nullable();
    t.bigInteger('client_timestamp').unsigned();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.json('metadata').nullable();
    t.index(['scene_id', 'id']);
    t.index(['campaign_id', 'created_at']);
  });

  // scene_connections
  await knex.schema.createTable('scene_connections', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('from_scene_id', 64).notNullable();
    t.string('to_scene_id', 64).notNullable();
    t.integer('walk_duration').notNullable();
    t.integer('bike_duration').nullable();
    t.integer('drive_duration').nullable();
    t.boolean('is_bidirectional').defaultTo(true);
    t.string('created_by', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // recruitment_posts
  await knex.schema.createTable('recruitment_posts', (t) => {
    t.string('id', 64).primary();
    t.string('poster_id', 64).notNullable();
    t.enu('type', ['gm_recruit', 'player_seek']).notNullable();
    t.string('title', 128).notNullable();
    t.string('campaign_id', 64).nullable();
    t.string('ruleset_id', 64).notNullable();
    t.integer('player_count_max').notNullable();
    t.enu('status', ['open', 'closed', 'full']).defaultTo('open');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // rulesets
  await knex.schema.createTable('rulesets', (t) => {
    t.string('id', 64).primary();
    t.string('name', 128).notNullable();
    t.string('version', 32).notNullable();
    t.string('parent_ruleset_id', 64).nullable();
    t.json('atoms').defaultTo('{}');
    t.json('connections').defaultTo('[]');
    t.json('commands').defaultTo('{}');
    t.json('character_card_schema').defaultTo('{}');
    t.enu('status', ['draft', 'published']).defaultTo('draft');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // campaign_npcs
  await knex.schema.createTable('campaign_npcs', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('source_module_npc_id', 64).nullable();
    t.string('name', 128).notNullable();
    t.string('display_name', 128).notNullable();
    t.string('avatar_url', 255).defaultTo('');
    t.text('description');
    t.text('voice_tips');
    t.json('attributes').defaultTo('{}');
    t.json('skills').defaultTo('{}');
    t.json('resources').defaultTo('{}');
    t.boolean('is_temporary').defaultTo(false);
    t.boolean('is_playable').defaultTo(true);
    t.boolean('is_active').defaultTo(true);
    t.string('created_by', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // campaign_round_state
  await knex.schema.createTable('campaign_round_state', (t) => {
    t.string('campaign_id', 64).primary();
    t.json('turn_order').defaultTo('[]');
    t.integer('current_index').defaultTo(0);
    t.integer('round_number').defaultTo(1);
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // position_history
  await knex.schema.createTable('position_history', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('character_id', 64).notNullable();
    t.string('scene_id', 64).notNullable();
    t.json('story_time_entered').notNullable();
    t.json('story_time_left').nullable();
    t.enu('move_type', ['scheduled', 'force_move', 'join', 'leave']).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['campaign_id', 'character_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'position_history', 'campaign_round_state', 'campaign_npcs',
    'rulesets', 'recruitment_posts', 'scene_connections',
    'chat_messages', 'scheduled_moves', 'scene_participations',
    'character_scene_states', 'character_sheets', 'scenes',
    'campaigns', 'users',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
