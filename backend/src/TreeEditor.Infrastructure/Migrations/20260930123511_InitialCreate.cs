using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TreeEditor.Infrastructure.Migrations;

public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE tree_nodes (
                id uuid PRIMARY KEY,
                parent_id uuid REFERENCES tree_nodes(id) DEFERRABLE INITIALLY DEFERRED,
                value text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 500),
                version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
                CHECK (parent_id IS DISTINCT FROM id)
            );

            CREATE INDEX ix_tree_nodes_parent_id_id ON tree_nodes(parent_id, id);

            CREATE TABLE tree_initialization (
                id integer PRIMARY KEY CHECK (id = 1)
            );

            CREATE FUNCTION prevent_tree_reparenting()
            RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.parent_id IS DISTINCT FROM OLD.parent_id
                    OR NEW.id IS DISTINCT FROM OLD.id THEN
                    RAISE EXCEPTION 'Existing node IDs and parent relationships are immutable'
                        USING ERRCODE = '23514';
                END IF;

                RETURN NEW;
            END;
            $$;

            CREATE TRIGGER tree_nodes_immutable_parent
                BEFORE UPDATE ON tree_nodes
                FOR EACH ROW
                EXECUTE FUNCTION prevent_tree_reparenting();
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("tree_nodes");
        migrationBuilder.DropTable("tree_initialization");
        migrationBuilder.Sql("DROP FUNCTION prevent_tree_reparenting()");
    }
}
