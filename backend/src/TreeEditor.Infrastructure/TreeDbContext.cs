using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using TreeEditor.Core.Domain;

namespace TreeEditor.Infrastructure;

public sealed class TreeDbContext(DbContextOptions<TreeDbContext> contextOptions)
    : DbContext(contextOptions)
{
    public DbSet<TreeNode> Nodes => Set<TreeNode>();

    internal DbSet<TreeInitialization> Initialization => Set<TreeInitialization>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TreeNode>(entityBuilder =>
        {
            entityBuilder.ToTable("tree_nodes", tableBuilder =>
            {
                tableBuilder.HasCheckConstraint(
                    "tree_nodes_value_check",
                    "length(btrim(value)) BETWEEN 1 AND 500");
                tableBuilder.HasCheckConstraint("tree_nodes_version_check", "version > 0");
                tableBuilder.HasCheckConstraint("tree_nodes_check", "parent_id IS DISTINCT FROM id");
            });

            entityBuilder.HasKey(node => node.Id)
                .HasName("tree_nodes_pkey");

            entityBuilder.Property(node => node.Id)
                .HasColumnName("id")
                .ValueGeneratedNever();

            entityBuilder.Property(node => node.ParentId)
                .HasColumnName("parent_id")
                .Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

            entityBuilder.Property(node => node.Value)
                .HasColumnName("value")
                .HasColumnType("text")
                .HasMaxLength(TreeNode.MaxValueLength)
                .IsRequired();

            entityBuilder.Property(node => node.Version)
                .HasColumnName("version")
                .HasDefaultValue(1L)
                .IsConcurrencyToken();

            entityBuilder.HasOne<TreeNode>()
                .WithMany()
                .HasForeignKey(node => node.ParentId)
                .OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("tree_nodes_parent_id_fkey");

            entityBuilder.HasIndex(node => new { node.ParentId, node.Id })
                .HasDatabaseName("ix_tree_nodes_parent_id_id");
        });

        modelBuilder.Entity<TreeInitialization>(entityBuilder =>
        {
            entityBuilder.ToTable("tree_initialization", tableBuilder =>
                tableBuilder.HasCheckConstraint("tree_initialization_id_check", "id = 1"));

            entityBuilder.HasKey(initializationMarker => initializationMarker.Id)
                .HasName("tree_initialization_pkey");

            entityBuilder.Property(initializationMarker => initializationMarker.Id)
                .HasColumnName("id")
                .ValueGeneratedNever();
        });
    }
}

internal sealed class TreeInitialization
{
    public int Id { get; set; } = 1;
}
